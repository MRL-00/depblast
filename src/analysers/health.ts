/**
 * Maintainer health analysis module.
 * Scores a package's maintainer health based on:
 * - Recency of last publish
 * - Number of maintainers
 * - Number of versions published (indicates active maintenance)
 * - Weekly downloads (popularity signal)
 * - Whether the package is deprecated
 */

import npmFetch from "npm-registry-fetch";
import { fetchNpmManifest } from "./transitive";
import { globalCache } from "../cache";
import { MaintainerDetails } from "../types";

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      scope?: string;
      version: string;
      description?: string;
      keywords?: string[];
      date?: string;
      links?: {
        npm?: string;
        homepage?: string;
        repository?: string;
        bugs?: string;
      };
      publisher?: { username: string; email: string };
      maintainers?: Array<{ username: string; email: string }>;
    };
    flags?: { unstable?: boolean };
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }>;
  total: number;
  time: string;
}

/**
 * Get npm search score details for a package.
 */
async function fetchSearchScore(packageName: string): Promise<{
  quality: number;
  popularity: number;
  maintenance: number;
  final: number;
} | null> {
  const cacheKey = `search:${packageName}`;
  const cached = globalCache.get<any>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(packageName)}&size=1`;
    const response = await npmFetch.json(url);
    const result = response as NpmSearchResult;

    if (result.objects && result.objects.length > 0) {
      // Find exact match
      const exactMatch = result.objects.find(
        (o) => o.package.name === packageName
      );
      if (exactMatch && exactMatch.score) {
        const scores = {
          quality: exactMatch.score.detail.quality,
          popularity: exactMatch.score.detail.popularity,
          maintenance: exactMatch.score.detail.maintenance,
          final: exactMatch.score.final,
        };
        globalCache.set(cacheKey, scores, 3_600_000);
        return scores;
      }
    }
  } catch {
    // OK
  }

  return null;
}

/**
 * Get weekly downloads from the npm downloads API.
 */
async function fetchWeeklyDownloads(packageName: string): Promise<number | null> {
  const cacheKey = `downloads:${packageName}`;
  const cached = globalCache.get<number>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`;
    const response = await npmFetch.json(url);
    const data = response as any;
    if (data && typeof data.downloads === "number") {
      globalCache.set(cacheKey, data.downloads, 86_400_000); // 24h
      return data.downloads;
    }
  } catch {
    // OK
  }

  return null;
}

/**
 * Compute a maintainer health score (1-5) based on multiple signals.
 */
export async function analyzeHealth(
  packageName: string,
  version: string
): Promise<{
  score: number | null;
  details: MaintainerDetails | null;
  deprecated: boolean;
}> {
  try {
    const manifest = await fetchNpmManifest(packageName);
    if (!manifest) {
      return { score: null, details: null, deprecated: false };
    }

    // Check deprecated status
    const versionInfo = manifest.versions?.[version];
    const deprecated = versionInfo?.deprecated === true || typeof versionInfo?.deprecated === "string";

    // Maintainer count
    const maintainerCount = manifest.maintainers?.length || 0;

    // Total versions published
    const totalVersions = manifest.versions ? Object.keys(manifest.versions).length : 0;

    // Last publish date
    const lastPublish = manifest.time?.[version] || null;

    // Search score for quality/popularity/maintenance signals
    const scores = await fetchSearchScore(packageName);

    // Weekly downloads
    const weeklyDownloads = await fetchWeeklyDownloads(packageName);

    const details: MaintainerDetails = {
      stars: scores ? Math.round(scores.popularity * 10000) : null,
      openIssues: null, // Would need GitHub API for this
      latestReleaseDate: lastPublish,
      weeklyDownloads,
      contributors: scores ? Math.round(scores.quality * 1000) : null,
    };

    // Compute score 1-5
    let score = 3; // Default neutral

    if (scores) {
      // Weighted score from npm search scores
      score = Math.round(
        (scores.maintenance * 4 + scores.popularity * 3 + scores.quality * 3) / 10 * 5
      );
    }

    // Adjust for maintainers
    if (maintainerCount === 0) score -= 1;
    if (maintainerCount >= 3) score += 1;
    if (maintainerCount >= 5) score += 1;

    // Adjust for recent activity
    if (lastPublish) {
      const monthsSincePublish = (Date.now() - new Date(lastPublish).getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsSincePublish > 12) score -= 1;
      if (monthsSincePublish > 24) score -= 1;
      if (monthsSincePublish > 36) score -= 1;
    }

    // Penalize deprecated packages
    if (deprecated) score -= 2;

    // Clamp to 1-5
    score = Math.max(1, Math.min(5, score));

    return { score, details, deprecated };
  } catch {
    return { score: null, details: null, deprecated: false };
  }
}
