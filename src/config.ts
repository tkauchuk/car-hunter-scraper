import type { ScraperConfig } from "./types.js";

/**
 * TARGET_HANDLES and TARGET_KEYWORDS are intentionally left as
 * placeholder stubs — fill them in before running.
 *
 * Instagram credentials are read from environment variables so they are
 * never committed to source control.  Set them before running:
 *
 *   export IG_EMAIL="you@example.com"
 *   export IG_PASSWORD="s3cr3t"
 */

export const TARGET_HANDLES: string[] = [
  // "carspotter_la",
  // "supercar_daily",
  // Add your target handles here
];

export const TARGET_KEYWORDS: string[] = [
  // "Porsche",
  // "GT3 RS",
  // "Ferrari",
  // "E30",
  // "Skyline",
  // Add your target keywords here
];

export const DEFAULT_CONFIG: ScraperConfig = {
  handles: TARGET_HANDLES,
  keywords: TARGET_KEYWORDS,
  maxPostsPerProfile: 12,
  delayMinMs: 3_000,
  delayMaxMs: 7_000,
  cookiesPath: "cookies.json",
  outputPath: "found_cars.json",
  headless: "new",
  instagramEmail: process.env["IG_EMAIL"] ?? "",
  instagramPassword: process.env["IG_PASSWORD"] ?? "",
};
