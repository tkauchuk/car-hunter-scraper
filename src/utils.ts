import UserAgent from "user-agents";

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomUserAgent(): string {
  const ua = new UserAgent({ deviceCategory: "desktop" });
  return ua.toString();
}

export function matchesKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

/** Ensures an array contains no duplicate strings. */
export function dedupeStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}
