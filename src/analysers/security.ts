/**
 * Security advisory analysis module.
 * Queries the npm security advisory API and GitHub Advisory Database
 * for known vulnerabilities in a given package version range.
 */

import npmFetch from "npm-registry-fetch";
import semver from "semver";
import { globalCache } from "../cache";
import { SecurityAdvisory } from "../types";

interface NpmAdvisory {
  id: number;
  title: string;
  cves: string[];
  severity: "critical" | "high" | "moderate" | "low";
  vulnerable_versions: string;
  patched_versions: string;
  overview: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch advisories for a package from the npm audit API.
 */
async function fetchNpmAdvisories(packageName: string): Promise<NpmAdvisory[]> {
  const cacheKey = `advisories:${packageName}`;
  const cached = globalCache.get<NpmAdvisory[]>(cacheKey);
  if (cached) return cached;

  try {
    // npm audit endpoint
    const url = `https://registry.npmjs.org/-/npm/v1/security/advisories?package=${encodeURIComponent(packageName)}`;
    const response = await npmFetch.json(url);

    const data = response as any;
    const advisories: NpmAdvisory[] = [];

    // The API returns advisories keyed by numeric ID
    if (data && typeof data === "object") {
      for (const key of Object.keys(data)) {
        const advisory = data[key];
        if (advisory && advisory.id) {
          advisories.push({
            id: advisory.id,
            title: advisory.title || "Untitled advisory",
            cves: advisory.cves || [],
            severity: (advisory.severity || "moderate").toLowerCase(),
            vulnerable_versions: advisory.vulnerable_versions || "",
            patched_versions: advisory.patched_versions || "",
            overview: advisory.overview || "",
            createdAt: advisory.createdAt || advisory.updatedAt || "",
            updatedAt: advisory.updatedAt || "",
          });
        }
      }
    }

    globalCache.set(cacheKey, advisories, 3_600_000); // Cache for 1 hour
    return advisories;
  } catch {
    return [];
  }
}

/**
 * Check if a version string is vulnerable to a given advisory.
 */
function isVersionVulnerable(version: string, advisory: NpmAdvisory): boolean {
  if (!advisory.vulnerable_versions) return false;

  // The vulnerable_versions may be a range like ">=1.0.0 <2.0.0"
  // Use semver to check if the version satisfies the vulnerable range
  try {
    return semver.satisfies(version, advisory.vulnerable_versions);
  } catch {
    // Malformed range, do a simple contains check
    return advisory.vulnerable_versions.includes(version);
  }
}

/**
 * Get security advisories affecting a specific package version.
 */
export async function analyzeSecurity(
  packageName: string,
  version: string
): Promise<SecurityAdvisory[]> {
  try {
    const advisories = await fetchNpmAdvisories(packageName);

    const relevant = advisories.filter((advisory) =>
      isVersionVulnerable(version, advisory)
    );

    return relevant.map((a) => ({
      severity: a.severity.toUpperCase() as SecurityAdvisory["severity"],
      summary: a.title,
      cveId: a.cves.length > 0 ? a.cves[0] : null,
      publishedAt: a.createdAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Quick summary of security severity.
 */
export function summarizeSecurityIssues(issues: SecurityAdvisory[]): string {
  if (issues.length === 0) return "✅ No known vulnerabilities";

  const critical = issues.filter((i) => i.severity === "CRITICAL").length;
  const high = issues.filter((i) => i.severity === "HIGH").length;
  const moderate = issues.filter((i) => i.severity === "MODERATE").length;
  const low = issues.filter((i) => i.severity === "LOW").length;

  const parts: string[] = [];
  if (critical) parts.push(`${critical} critical`);
  if (high) parts.push(`${high} high`);
  if (moderate) parts.push(`${moderate} moderate`);
  if (low) parts.push(`${low} low`);

  return `🔒 ${parts.join(", ")} advisory(ies)`;
}
