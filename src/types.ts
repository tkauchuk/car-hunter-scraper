export interface ScraperConfig {
  handles: string[];
  keywords: string[];
  maxPostsPerProfile: number;
  delayMinMs: number;
  delayMaxMs: number;
  cookiesPath: string;
  outputPath: string;
  headless: "new" | false;
  instagramEmail: string;
  instagramPassword: string;
}

export interface ScrapedPost {
  url: string;
  caption: string;
  timestamp: string;
  profile: string;
  matchedKeywords: string[];
  discoveredAt: string;
}

export interface FoundCarsStore {
  lastUpdated: string;
  posts: ScrapedPost[];
}

export interface ProfileScanResult {
  handle: string;
  scannedAt: string;
  postsFound: number;
  matchesFound: number;
  error: string | null;
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  profileResults: ProfileScanResult[];
  totalNewMatches: number;
}

/** Raw cookie shape from Puppeteer / JSON on disk */
export interface SerializableCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}
