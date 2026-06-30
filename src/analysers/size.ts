/**
 * Bundle size estimation module.
 * Uses the bundlephobia API for accurate minified+gzipped sizes,
 * with a fallback to npm registry package metadata.
 */

import npmFetch from "npm-registry-fetch";
import { globalCache } from "../cache";

interface BundlephobiaResult {
  size: number;       // minified bytes
  gzip: number;       // gzipped bytes
  dependencyCount: number;
  hasJSModule: boolean;
  hasJSNext: boolean;
  hasSideEffects: boolean;
  name: string;
  version: string;
  error?: string;
}

/**
 * Fetch bundle size from bundlephobia API.
 */
async function fetchBundlephobia(packageName: string, version: string): Promise<BundlephobiaResult | null> {
  const cacheKey = `bundlephobia:${packageName}@${version}`;
  const cached = globalCache.get<BundlephobiaResult>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://bundlephobia.com/api/size?package=${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
    const response = await npmFetch.json(url);

    const result = response as BundlephobiaResult;

    // Cached results have a different shape — check for actual size
    if (result && typeof result.size === "number") {
      globalCache.set(cacheKey, result, 86_400_000); // Cache for 24h (size data is stable)
      return result;
    }
  } catch {
    // Bundlephobia may not have the package — that's ok
  }

  return null;
}

/**
 * Fallback: estimate size from npm registry package tarball size.
 */
async function fetchNpmTarballSize(packageName: string, version: string): Promise<number | null> {
  const cacheKey = `tarball:${packageName}@${version}`;
  const cached = globalCache.get<number>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
    const manifest = await npmFetch.json(url);

    const pkg = manifest as any;
    if (pkg?.dist?.unpackedSize) {
      const size = parseInt(pkg.dist.unpackedSize, 10);
      if (!isNaN(size)) {
        globalCache.set(cacheKey, size, 86_400_000);
        return size;
      }
    }
    // Alternative: use tarball size as rough estimate
    if (pkg?.dist?.fileCount) {
      // Rough estimate: 5KB per file average
      const estimate = (pkg.dist.fileCount || 1) * 5120;
      globalCache.set(cacheKey, estimate, 86_400_000);
      return estimate;
    }
  } catch {
    // OK
  }

  return null;
}

/**
 * Get the best available size estimate for a package.
 * Prefers bundlephobia for accurate gzipped size, falls back to npm tarball size.
 */
export async function analyzeSize(
  packageName: string,
  version: string
): Promise<{
  sizeBytes: number | null;
  gzipBytes: number | null;
  source: "bundlephobia" | "npm-tarball" | null;
}> {
  // Try bundlephobia first (most useful — post-gzip size for browser bundles)
  const bundlephobia = await fetchBundlephobia(packageName, version);
  if (bundlephobia && !bundlephobia.error) {
    return {
      sizeBytes: bundlephobia.size,
      gzipBytes: bundlephobia.gzip,
      source: "bundlephobia",
    };
  }

  // Fallback to npm tarball size
  const tarballSize = await fetchNpmTarballSize(packageName, version);
  if (tarballSize) {
    return {
      sizeBytes: tarballSize,
      gzipBytes: null,
      source: "npm-tarball",
    };
  }

  return {
    sizeBytes: null,
    gzipBytes: null,
    source: null,
  };
}
