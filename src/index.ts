import { InstagramScraper } from "./scraper.js";
import { DEFAULT_CONFIG } from "./config.js";
import { randomDelay } from "./utils.js";
import { logger } from "./logger.js";
import type { RunSummary } from "./types.js";

async function run(): Promise<void> {
  const config = DEFAULT_CONFIG;

  if (config.handles.length === 0) {
    logger.warn(
      "No target handles configured. Edit TARGET_HANDLES in src/config.ts."
    );
    process.exit(0);
  }

  if (config.keywords.length === 0) {
    logger.warn(
      "No target keywords configured. Edit TARGET_KEYWORDS in src/config.ts."
    );
    process.exit(0);
  }

  logger.section("Car Hunter — Instagram Scraper");
  logger.info(`Profiles to scan : ${config.handles.join(", ")}`);
  logger.info(`Keywords         : ${config.keywords.join(", ")}`);
  logger.info(`Max posts/profile: ${config.maxPostsPerProfile}`);
  logger.info(`Output file      : ${config.outputPath}`);

  const startedAt = new Date().toISOString();
  const scraper = new InstagramScraper(config);

  try {
    await scraper.init();
    await scraper.authenticate();

    const summary: RunSummary = {
      startedAt,
      finishedAt: "",
      profileResults: [],
      totalNewMatches: 0,
    };

    for (let i = 0; i < config.handles.length; i++) {
      const handle = config.handles[i];

      if (i > 0) {
        // Randomized inter-profile delay to appear human
        const delayMs =
          config.delayMinMs +
          Math.floor(Math.random() * (config.delayMaxMs - config.delayMinMs));
        logger.info(
          `Waiting ${(delayMs / 1000).toFixed(1)}s before next profile…`
        );
        await randomDelay(config.delayMinMs, config.delayMaxMs);
      }

      const result = await scraper.scanProfile(handle!);
      summary.profileResults.push(result);
      summary.totalNewMatches += result.matchesFound;
    }

    summary.finishedAt = new Date().toISOString();

    // ── Final run summary ──────────────────────────────────────────────────
    logger.section("Run Summary");
    logger.summary("Started at", summary.startedAt);
    logger.summary("Finished at", summary.finishedAt);
    logger.summary("Total new matches", summary.totalNewMatches);

    for (const r of summary.profileResults) {
      const status = r.error ? "✗ ERROR" : "✓ OK";
      const detail = r.error
        ? `— ${r.error}`
        : `${r.postsFound} scraped, ${r.matchesFound} new matches`;
      logger.info(`  @${r.handle} [${status}] ${detail}`);
    }

    if (summary.totalNewMatches === 0) {
      logger.info("No new car posts found in this run.");
    } else {
      logger.success(
        `Found ${summary.totalNewMatches} new car post(s). Results saved to ${config.outputPath}`
      );
    }
  } catch (err) {
    logger.error("Fatal error during scraper run", err);
    process.exitCode = 1;
  } finally {
    await scraper.close();
  }
}

run();
