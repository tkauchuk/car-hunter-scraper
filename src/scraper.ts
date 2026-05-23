import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import type {
  ScraperConfig,
  ScrapedPost,
  ProfileScanResult,
} from "./types.js";
import { loadCookies, saveCookies } from "./cookieManager.js";
import { appendNewPosts } from "./store.js";
import { randomDelay, randomUserAgent, matchesKeywords } from "./utils.js";
import { logger } from "./logger.js";

puppeteer.use(StealthPlugin());

const IG_BASE = "https://www.instagram.com";
const IG_LOGIN = `${IG_BASE}/accounts/login/`;

// ─── DOM selectors (Instagram changes these periodically) ────────────────────
// Post anchor tags in the profile grid. The aria-label approach is more stable
// than relying on brittle class names.
const SELECTORS = {
  // Individual post links in the grid
  postLinks: "article a[href*='/p/']",
  // Caption accessible text on a post page
  captionText: "h1, [data-testid='post-comment-root'] span, article span",
  // Timestamp element
  timestamp: "time[datetime]",
  // Login form fields
  loginEmail: "input[name='username']",
  loginPassword: "input[name='password']",
  loginButton: "button[type='submit']",
  // Cookie consent / "Accept all" that Instagram shows in some regions
  cookieBanner: "button[tabindex='0']",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawPost {
  url: string;
  caption: string;
  timestamp: string;
}

// ─── Scraper class ───────────────────────────────────────────────────────────

export class InstagramScraper {
  private readonly config: ScraperConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    logger.info("Launching browser…");
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--window-size=1440,900",
      ],
    });

    this.page = await this.browser.newPage();

    await this.page.setUserAgent(randomUserAgent());
    await this.page.setViewport({ width: 1440, height: 900 });

    // Suppress image loading to speed things up (captions are text-only)
    await this.page.setRequestInterception(true);
    this.page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "image" || type === "media" || type === "font") {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  async authenticate(): Promise<void> {
    const page = this.requirePage();

    // Try restoring session from saved cookies first
    const cookiesLoaded = await loadCookies(page, this.config.cookiesPath);

    if (cookiesLoaded) {
      // Verify the session is still valid by navigating to the home feed
      await page.goto(IG_BASE, { waitUntil: "networkidle2", timeout: 30_000 });

      const isLoggedIn = await this.isLoggedIn(page);
      if (isLoggedIn) {
        logger.info("Session restored from cookies — skipping login.");
        return;
      }
      logger.warn("Saved cookies are no longer valid — performing fresh login.");
    }

    await this.login(page);
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // Instagram shows a login button in the nav when not authenticated
      const loginLink = await page.$("a[href='/accounts/login/']");
      return loginLink === null;
    } catch {
      return false;
    }
  }

  private async login(page: Page): Promise<void> {
    if (!this.config.instagramEmail || !this.config.instagramPassword) {
      throw new Error(
        "Instagram credentials missing. Set IG_EMAIL and IG_PASSWORD environment variables."
      );
    }

    logger.info("Navigating to Instagram login page…");
    await page.goto(IG_LOGIN, { waitUntil: "networkidle2", timeout: 30_000 });

    // Dismiss cookie consent banner if present
    await this.dismissCookieBanner(page);

    await page.waitForSelector(SELECTORS.loginEmail, { timeout: 15_000 });
    await randomDelay(1_000, 2_000);

    // Type credentials with human-like keystroke timing
    await page.type(SELECTORS.loginEmail, this.config.instagramEmail, {
      delay: randomInt(80, 140),
    });
    await randomDelay(500, 1_000);
    await page.type(
      SELECTORS.loginPassword,
      this.config.instagramPassword,
      { delay: randomInt(80, 140) }
    );
    await randomDelay(500, 1_000);

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }),
      page.click(SELECTORS.loginButton),
    ]);

    // Handle "Save your login info?" and "Turn on notifications?" dialogs
    await this.dismissPostLoginDialogs(page);

    const loggedIn = await this.isLoggedIn(page);
    if (!loggedIn) {
      throw new Error(
        "Login failed — Instagram may have triggered a security challenge. " +
          "Try logging in manually with the same account and saving cookies.json."
      );
    }

    logger.success("Login successful.");
    await saveCookies(page, this.config.cookiesPath);
  }

  private async dismissCookieBanner(page: Page): Promise<void> {
    try {
      const buttons = await page.$$(SELECTORS.cookieBanner);
      for (const btn of buttons) {
        const text = await btn.evaluate((el) => el.textContent ?? "");
        if (/allow|accept/i.test(text)) {
          await btn.click();
          await randomDelay(500, 1_000);
          break;
        }
      }
    } catch {
      // Banner may not be present — silently ignore
    }
  }

  private async dismissPostLoginDialogs(page: Page): Promise<void> {
    const dismissSelectors = [
      "button[tabindex='0']", // "Not Now" buttons
    ];
    for (const sel of dismissSelectors) {
      try {
        const btn = await page.waitForSelector(sel, { timeout: 5_000 });
        if (btn) {
          const text = await btn.evaluate((el) => el.textContent ?? "");
          if (/not now|skip|later/i.test(text)) {
            await btn.click();
            await randomDelay(500, 1_000);
          }
        }
      } catch {
        // Dialog not present — continue
      }
    }
  }

  // ── Profile scanning ───────────────────────────────────────────────────────

  async scanProfile(handle: string): Promise<ProfileScanResult> {
    const page = this.requirePage();
    const profileUrl = `${IG_BASE}/${handle}/`;
    const scannedAt = new Date().toISOString();

    logger.info(`Scanning profile: @${handle}`);

    try {
      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      // Wait for the post grid
      await page.waitForSelector(SELECTORS.postLinks, { timeout: 20_000 });

      const postUrls = await this.extractPostUrls(page);
      logger.info(`  Found ${postUrls.length} post links on @${handle}`);

      const rawPosts = await this.scrapePostDetails(page, postUrls, handle);
      const matched = this.filterByKeywords(rawPosts, handle);

      const persisted = await appendNewPosts(this.config.outputPath, matched);

      for (const post of persisted) {
        logger.success(
          `  NEW MATCH on @${handle}: [${post.matchedKeywords.join(", ")}] ${post.url}`
        );
      }

      return {
        handle,
        scannedAt,
        postsFound: rawPosts.length,
        matchesFound: persisted.length,
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to scan @${handle}`, err);
      return {
        handle,
        scannedAt,
        postsFound: 0,
        matchesFound: 0,
        error: message,
      };
    }
  }

  private async extractPostUrls(page: Page): Promise<string[]> {
    const links = await page.$$(SELECTORS.postLinks);
    const hrefs: string[] = await Promise.all(
      links.slice(0, this.config.maxPostsPerProfile).map((link) =>
        link.evaluate((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
      )
    );

    return hrefs
      .filter((href: string) => href.length > 0)
      .map((href: string) =>
        href.startsWith("http") ? href : `${IG_BASE}${href}`
      );
  }

  private async scrapePostDetails(
    page: Page,
    urls: string[],
    handle: string
  ): Promise<RawPost[]> {
    const results: RawPost[] = [];

    for (const url of urls) {
      try {
        await randomDelay(
          this.config.delayMinMs,
          this.config.delayMaxMs
        );

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 25_000,
        });

        const caption = await this.extractCaption(page);
        const timestamp = await this.extractTimestamp(page);

        results.push({ url, caption, timestamp });
        logger.info(`    Scraped post: ${url.split("/p/")[1]?.replace(/\/$/, "") ?? url}`);
      } catch (err) {
        logger.warn(`    Skipping post ${url} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Navigate back to the profile so the next profile load is from a
    // known state (reduces fingerprint inconsistency)
    try {
      await page.goto(`${IG_BASE}/${handle}/`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
    } catch {
      // Non-fatal — next profile navigation will handle it
    }

    return results;
  }

  private async extractCaption(page: Page): Promise<string> {
    try {
      // Strategy 1: look for the main post caption <h1> or aria-described span
      const captionEl = await page.waitForSelector(
        "article h1, article [data-testid='post-comment-root'] > span",
        { timeout: 8_000 }
      );
      if (captionEl) {
        const text = await captionEl.evaluate((el) => el.textContent ?? "");
        if (text.trim().length > 0) return text.trim();
      }
    } catch {
      // Fall through to strategy 2
    }

    try {
      // Strategy 2: scrape all span text in the article and join
      const spans = await page.$$eval("article span", (els) =>
        els
          .map((el) => el.textContent ?? "")
          .filter((t) => t.trim().length > 3)
          .join(" ")
      );
      if (spans.trim().length > 0) return spans.trim();
    } catch {
      // Fall through to strategy 3
    }

    try {
      // Strategy 3: use the meta description (Open Graph) for caption
      const metaDesc = await page.$eval(
        'meta[name="description"], meta[property="og:description"]',
        (el) => el.getAttribute("content") ?? ""
      );
      if (metaDesc.trim().length > 0) return metaDesc.trim();
    } catch {
      // No caption available
    }

    return "";
  }

  private async extractTimestamp(page: Page): Promise<string> {
    try {
      const ts = await page.$eval(
        SELECTORS.timestamp,
        (el) => el.getAttribute("datetime") ?? ""
      );
      return ts;
    } catch {
      return new Date().toISOString();
    }
  }

  // ── Keyword filtering ──────────────────────────────────────────────────────

  private filterByKeywords(
    posts: RawPost[],
    profile: string
  ): ScrapedPost[] {
    const matched: ScrapedPost[] = [];

    for (const post of posts) {
      const keywords = matchesKeywords(post.caption, this.config.keywords);
      if (keywords.length > 0) {
        matched.push({
          url: post.url,
          caption: post.caption,
          timestamp: post.timestamp,
          profile,
          matchedKeywords: keywords,
          discoveredAt: new Date().toISOString(),
        });
      }
    }

    return matched;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private requirePage(): Page {
    if (!this.page) throw new Error("Browser page not initialised. Call init() first.");
    return this.page;
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
