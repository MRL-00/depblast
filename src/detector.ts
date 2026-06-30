/**
 * Detects new dependencies added in a PR by comparing package.json
 * content from the base and head branches.
 */

import { ProbotOctokit } from "probot";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface NewDep {
  name: string;
  version: string;
  type: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";
}

/**
 * Fetch package.json from a specific ref and parse it.
 */
async function fetchPackageJson(
  octokit: InstanceType<typeof ProbotOctokit>,
  owner: string,
  repo: string,
  ref: string
): Promise<PackageJson | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "package.json",
      ref,
    });

    if ("content" in data) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return JSON.parse(decoded);
    }
  } catch (err: any) {
    // Status 404 = no package.json at that ref, possible initial commit
    if (err.status !== 404) {
      throw err;
    }
  }
  return null;
}

/**
 * Extract dependencies from a parsed package.json, grouped by type.
 */
function extractDeps(pkg: PackageJson): NewDep[] {
  const deps: NewDep[] = [];

  const sections: Array<keyof PackageJson> = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];

  for (const section of sections) {
    const entries = pkg[section];
    if (entries) {
      for (const [name, version] of Object.entries(entries)) {
        deps.push({ name, version: cleanVersion(version), type: section });
      }
    }
  }

  return deps;
}

/**
 * Clean a version string to its base semver.
 * '^1.2.3' -> '1.2.3', '~2.0.0' -> '2.0.0', '1.x' -> '1.0.0' approximation
 */
function cleanVersion(version: string): string {
  return version
    .replace(/^\^/, "")
    .replace(/^~/, "")
    .replace(/>=?/, "")
    .replace(/<=?/, "")
    .replace(/^v/, "")
    .replace(/\.x$/g, ".0");
}

/**
 * Build a Set of dependency names from a list.
 */
function depNameSet(deps: NewDep[]): Set<string> {
  return new Set(deps.map((d) => d.name));
}

/**
 * Detect new dependencies in a PR.
 * Compares package.json from the PR's base branch vs the head branch.
 */
export async function detectNewDependencies(
  octokit: InstanceType<typeof ProbotOctokit>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<NewDep[]> {
  // Get PR details to find base and head refs
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const baseRef = pr.base.ref;
  const headRef = pr.head.ref;

  // Fetch package.json from both branches
  const basePkg = await fetchPackageJson(octokit, owner, repo, baseRef);
  const headPkg = await fetchPackageJson(octokit, owner, repo, `refs/pull/${prNumber}/head`);

  // If no package.json in head, nothing to analyze
  if (!headPkg) {
    return [];
  }

  const headDeps = extractDeps(headPkg);
  const headNames = depNameSet(headDeps);

  // If no base package.json, all deps are new
  if (!basePkg) {
    return headDeps;
  }

  const baseDeps = extractDeps(basePkg);
  const baseNames = depNameSet(baseDeps);

  // New deps are those in head but not in base
  const newDeps = headDeps.filter((dep) => !baseNames.has(dep.name));

  // Also detect version bumps on existing deps — treat as new for re-evaluation
  // Build a map of base deps for version comparison
  const baseDepMap = new Map<string, NewDep>();
  for (const dep of baseDeps) {
    baseDepMap.set(dep.name, dep);
  }

  // Check for version bumps
  for (const dep of headDeps) {
    if (baseNames.has(dep.name)) {
      const baseDep = baseDepMap.get(dep.name)!;
      if (baseDep.version !== dep.version) {
        // Version changed — include for re-analysis
        newDeps.push(dep);
      }
    }
  }

  return newDeps;
}
