import fs from "fs/promises";
import path from "path";
import type { FoundCarsStore, ScrapedPost } from "./types.js";
import { logger } from "./logger.js";

async function readStore(outputPath: string): Promise<FoundCarsStore> {
  const resolved = path.resolve(outputPath);
  try {
    await fs.access(resolved);
    const raw = await fs.readFile(resolved, "utf-8");
    return JSON.parse(raw) as FoundCarsStore;
  } catch {
    return { lastUpdated: new Date().toISOString(), posts: [] };
  }
}

/**
 * Appends new posts to the JSON store, deduplicating by post URL.
 * Returns only the posts that were genuinely new.
 */
export async function appendNewPosts(
  outputPath: string,
  incoming: ScrapedPost[]
): Promise<ScrapedPost[]> {
  const store = await readStore(outputPath);
  const existingUrls = new Set(store.posts.map((p) => p.url));

  const newPosts = incoming.filter((p) => !existingUrls.has(p.url));

  if (newPosts.length === 0) {
    return [];
  }

  store.posts = [...store.posts, ...newPosts];
  store.lastUpdated = new Date().toISOString();

  const resolved = path.resolve(outputPath);
  await fs.writeFile(resolved, JSON.stringify(store, null, 2), "utf-8");
  logger.info(`Saved ${newPosts.length} new post(s) to ${outputPath}`);

  return newPosts;
}
