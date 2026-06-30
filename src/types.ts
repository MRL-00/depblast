/** Information about a single dependency found in a PR */
export interface DependencyInfo {
  name: string;
  version: string;
  type: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";
  /** Transitive dependencies (flattened) */
  transitiveDeps: TransitiveDep[];
  /** Total size in bytes (estimated) */
  sizeBytes: number | null;
  /** License identifier from the npm package */
  license: string | null;
  /** Whether the license is considered risky */
  licenseRisk: boolean;
  /** Known security advisories */
  securityIssues: SecurityAdvisory[];
  /** Maintainer health score (1-5, 5=best) */
  maintainerScore: number | null;
  /** Maintainer health breakdown */
  maintainerDetails: MaintainerDetails | null;
  /** When the package was last published */
  lastPublishDate: string | null;
  /** Number of maintainers */
  maintainerCount: number | null;
  /** Total number of versions published */
  totalVersions: number | null;
  /** Whether the package is deprecated */
  deprecated: boolean;
}

export interface TransitiveDep {
  name: string;
  version: string;
  depth: number;
  license: string | null;
  sizeBytes: number | null;
}

export interface SecurityAdvisory {
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  summary: string;
  cveId: string | null;
  publishedAt: string;
}

export interface MaintainerDetails {
  /** GitHub stars of the repo (if available) */
  stars: number | null;
  /** Number of open issues */
  openIssues: number | null;
  /** When the latest version was released */
  latestReleaseDate: string | null;
  /** Number of weekly downloads */
  weeklyDownloads: number | null;
  /** Number of contributors */
  contributors: number | null;
}

/** The full report for a PR */
export interface DepBlastReport {
  repoFullName: string;
  prNumber: number;
  analyzedAt: string;
  dependencies: DependencyInfo[];
  summary: {
    totalNewDeps: number;
    totalTransitiveDeps: number;
    totalSizeBytes: number;
    hasLicenseIssues: boolean;
    hasSecurityIssues: boolean;
    hasHealthIssues: boolean;
  };
}
