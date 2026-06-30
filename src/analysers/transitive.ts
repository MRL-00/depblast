/**
 * Resolves the transitive dependency tree for a given npm package.
 * Uses the npm registry API to get each package's metadata recursively.
 */

import npmFetch from "npm-registry-fetch";
import semver from "semver";
import { globalCache } from "../cache";
import { TransitiveDep } from "../types";

interface NpmPackageVersion {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  license?: string;
  deprecated?: boolean;
}

interface NpmManifest {
  name: string;
  versions: Record<string, any>;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  maintainers?: Array<{ name: string; email?: string }>;
  description?: string;
}

interface ResolvedDep {
  name: string;
  version: string;
}

/**
 * Fetch full manifest for a package from npm registry, with caching.
 */
export async function fetchNpmManifest(packageName: string): Promise<NpmManifest | null> {
  const cacheKey = `manifest:${packageName}`;
  const cached = globalCache.get<NpmManifest>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const manifest = await npmFetch.json(url, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = manifest as any;
    globalCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    if (err.status === 404) return null;
    if (err.status === 429) {
      // Rate limited – wait and retry once
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
        const manifest = await npmFetch.json(url, {
          headers: { Accept: "application/vnd.npm.install-v1+json" },
        });
        const result = manifest as any;
        globalCache.set(cacheKey, result);
        return result;
      } catch {
        return null;
      }
    }
    throw err;
  }
}

/**
 * Resolve a semver range to the best matching version from a manifest.
 */
function resolveVersion(range: string, manifest: NpmManifest): string | null {
  // Try exact version first
  if (manifest.versions[range]) {
    return range;
  }

  // Try dist-tag (e.g. "latest")
  if (manifest["dist-tags"]) {
    const tagVersion = manifest["dist-tags"][range];
    if (tagVersion && manifest.versions[tagVersion]) {
      return tagVersion;
    }
  }

  // Use semver to find max satisfying
  const versions = Object.keys(manifest.versions);
  const maxSatisfying = semver.maxSatisfying(versions, range);
  if (maxSatisfying) {
    return maxSatisfying;
  }

  return null;
}

/**
 * Get resolved version and metadata for a specific package version.
 */
function getVersionInfo(
  manifest: NpmManifest,
  version: string
): NpmPackageVersion | null {
  const v = manifest.versions[version];
  if (!v) return null;

  return {
    name: v.name || manifest.name,
    version: v.version,
    dependencies: v.dependencies,
    license: v.license,
    deprecated: v.deprecated,
  };
}

/**
 * Get a specific package's version info from the registry.
 */
async function getPackageVersionInfo(
  packageName: string,
  versionRange: string
): Promise<NpmPackageVersion | null> {
  const cacheKey = `version:${packageName}@${versionRange}`;
  const cached = globalCache.get<NpmPackageVersion>(cacheKey);
  if (cached) return cached;

  const manifest = await fetchNpmManifest(packageName);
  if (!manifest) return null;

  const resolved = resolveVersion(versionRange, manifest);
  if (!resolved) return null;

  const info = getVersionInfo(manifest, resolved);
  if (info) {
    globalCache.set(cacheKey, info);
  }

  return info ?? null;
}

/**
 * Resolve transitive dependencies recursively.
 */
async function resolveTransitiveDeps(
  packageName: string,
  versionRange: string,
  maxDepth: number,
  currentDepth: number = 0,
  visited: Set<string> = new Set()
): Promise<TransitiveDep[]> {
  if (currentDepth >= maxDepth) return [];

  const depKey = `${packageName}@${versionRange}`;
  if (visited.has(depKey)) return [];
  visited.add(depKey);

  const info = await getPackageVersionInfo(packageName, versionRange);
  if (!info || !info.dependencies) return [];

  const results: TransitiveDep[] = [];
  const entries = Object.entries(info.dependencies);

  // Process top-level dependents
  const directChildren: Array<{ name: string; range: string }> = [];

  for (const [depName, depRange] of entries) {
    const depInfo = await getPackageVersionInfo(depName, depRange);
    const resolvedVersion = depInfo?.version || depRange;

    results.push({
      name: depName,
      version: resolvedVersion,
      depth: currentDepth + 1,
      license: depInfo?.license || null,
      sizeBytes: null, // Size estimation is done separately
    });

    directChildren.push({ name: depName, range: depRange });
  }

  // Recurse into children
  for (const child of directChildren) {
    const childDeps = await resolveTransitiveDeps(
      child.name,
      child.range,
      maxDepth,
      currentDepth + 1,
      visited
    );
    results.push(...childDeps);
  }

  return results;
}

/**
 * Resolve the full transitive dependency tree for a package.
 */
export async function analyzeTransitiveDeps(
  packageName: string,
  versionRange: string,
  maxDepth: number = 3
): Promise<{
  transitiveDeps: TransitiveDep[];
}> {
  const transitiveDeps = await resolveTransitiveDeps(packageName, versionRange, maxDepth);

  // Deduplicate by name
  const seen = new Set<string>();
  const deduped: TransitiveDep[] = [];

  for (const dep of transitiveDeps) {
    const key = dep.name;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(dep);
    }
  }

  return { transitiveDeps: deduped };
}
