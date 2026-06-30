/**
 * Main analysis orchestrator.
 * Takes detected new dependencies and runs all analysis modules on each.
 */

import { ProbotOctokit } from "probot";
type Logger = { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void; debug: (...args: any[]) => void; };
import { detectNewDependencies, NewDep } from "./detector";
import { analyzeTransitiveDeps } from "./analysers/transitive";
import { analyzeLicense } from "./analysers/license";
import { analyzeSize } from "./analysers/size";
import { analyzeSecurity } from "./analysers/security";
import { analyzeHealth } from "./analysers/health";
import { DepBlastReport, DependencyInfo } from "./types";

export async function analyzePR(
  context: any,
  owner: string,
  repo: string,
  prNumber: number,
  prHead: string,
  changedFiles: string[],
  repoConfig: Record<string, any>,
  log: Logger
): Promise<DepBlastReport | null> {
  const octokit: InstanceType<typeof ProbotOctokit> = context.octokit;

  // Detect new dependencies from the PR diff
  log.info(`Detecting new dependencies for PR #${prNumber}`);
  const newDeps = await detectNewDependencies(octokit, owner, repo, prNumber);

  if (newDeps.length === 0) {
    log.info(`PR #${prNumber}: No new dependencies found`);
    return null;
  }

  log.info(`Found ${newDeps.length} new/changed dependencies in PR #${prNumber}`);

  // Run analysis on each new dependency
  const depInfos: DependencyInfo[] = [];
  let totalTransitiveDeps = 0;
  let totalSizeBytes = 0;
  let hasLicenseIssues = false;
  let hasSecurityIssues = false;
  let hasHealthIssues = false;

  for (const dep of newDeps) {
    log.info(`Analyzing ${dep.name}@${dep.version}...`);

    // Run all analyses in parallel per dep
    const [transitiveResult, licenseResult, sizeResult, securityIssues, healthResult] =
      await Promise.all([
        analyzeTransitiveDeps(dep.name, dep.version, 3),
        Promise.resolve(analyzeLicense(null)), // will be fed from manifest
        analyzeSize(dep.name, dep.version),
        analyzeSecurity(dep.name, dep.version),
        analyzeHealth(dep.name, dep.version),
      ]);

    // Get license from the manifest (we need to fetch it properly)
    const { fetchNpmManifest } = await import("./analysers/transitive");
    const manifest = await fetchNpmManifest(dep.name);
    let license: string | null = null;
    let licenseRisk = false;
    let licenseReason: string | undefined;

    if (manifest?.versions?.[dep.version]?.license) {
      const result = analyzeLicense(manifest.versions[dep.version].license);
      license = result.license;
      licenseRisk = result.isRisky;
      licenseReason = result.reason;
    } else if (manifest?.versions) {
      // Try to find any version's license
      const versions = Object.keys(manifest.versions).sort();
      for (const v of versions.reverse()) {
        const lic = manifest.versions[v]?.license;
        if (lic) {
          const result = analyzeLicense(lic);
          license = result.license;
          licenseRisk = result.isRisky;
          licenseReason = result.reason;
          break;
        }
      }
    }

    const depInfo: DependencyInfo = {
      name: dep.name,
      version: dep.version,
      type: dep.type,
      transitiveDeps: transitiveResult.transitiveDeps,
      sizeBytes: sizeResult.sizeBytes,
      license,
      licenseRisk,
      securityIssues,
      maintainerScore: healthResult.score,
      maintainerDetails: healthResult.details,
      lastPublishDate: healthResult.details?.latestReleaseDate || null,
      maintainerCount: manifest?.maintainers?.length || null,
      totalVersions: manifest?.versions ? Object.keys(manifest.versions).length : null,
      deprecated: healthResult.deprecated,
    };

    // Accumulate summary stats
    totalTransitiveDeps += transitiveResult.transitiveDeps.length;

    // For size, only add direct dep size (transitive sizes are part of the direct dep)
    // But if a direct dep has no size info, sum its transitive deps' sizes as a proxy
    if (sizeResult.sizeBytes !== null) {
      totalSizeBytes += sizeResult.sizeBytes;
    } else if (transitiveResult.transitiveDeps.length > 0) {
      // Sum transitive dep sizes (rough estimate)
      for (const td of transitiveResult.transitiveDeps) {
        if (td.sizeBytes) totalSizeBytes += td.sizeBytes;
      }
    }

    if (licenseRisk) hasLicenseIssues = true;
    if (securityIssues.length > 0) hasSecurityIssues = true;
    if (healthResult.score !== null && healthResult.score < 3) hasHealthIssues = true;

    depInfos.push(depInfo);
  }

  const report: DepBlastReport = {
    repoFullName: `${owner}/${repo}`,
    prNumber,
    analyzedAt: new Date().toISOString(),
    dependencies: depInfos,
    summary: {
      totalNewDeps: newDeps.length,
      totalTransitiveDeps,
      totalSizeBytes,
      hasLicenseIssues,
      hasSecurityIssues,
      hasHealthIssues,
    },
  };

  return report;
}
