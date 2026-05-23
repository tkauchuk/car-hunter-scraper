import fs from "fs/promises";
import path from "path";
import type { Page } from "puppeteer";
import type { SerializableCookie } from "./types.js";
import { logger } from "./logger.js";

export async function loadCookies(
  page: Page,
  cookiesPath: string
): Promise<boolean> {
  const resolved = path.resolve(cookiesPath);

  try {
    await fs.access(resolved);
  } catch {
    logger.info("No cookies file found — will attempt fresh login.");
    return false;
  }

  try {
    const raw = await fs.readFile(resolved, "utf-8");
    const cookies = JSON.parse(raw) as SerializableCookie[];

    if (!Array.isArray(cookies) || cookies.length === 0) {
      logger.warn("Cookies file is empty or malformed — will re-login.");
      return false;
    }

    // Check if session cookie is still within a reasonable expiry window
    const now = Date.now() / 1000;
    const sessionidCookie = cookies.find((c) => c.name === "sessionid");
    if (sessionidCookie && sessionidCookie.expires > 0 && sessionidCookie.expires < now) {
      logger.warn("Session cookie has expired — will re-login.");
      return false;
    }

    await page.setCookie(...cookies);
    logger.info(`Loaded ${cookies.length} cookies from ${cookiesPath}`);
    return true;
  } catch (err) {
    logger.error("Failed to parse cookies file", err);
    return false;
  }
}

export async function saveCookies(
  page: Page,
  cookiesPath: string
): Promise<void> {
  const resolved = path.resolve(cookiesPath);
  const cookies = await page.cookies();

  await fs.writeFile(resolved, JSON.stringify(cookies, null, 2), "utf-8");
  logger.info(`Saved ${cookies.length} cookies to ${cookiesPath}`);
}
