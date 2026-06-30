/**
 * License analysis module.
 * Checks the license of a package and compares it against known risky/restrictive licenses.
 */

import { globalCache } from "../cache";
import spdxLicenseIds from "spdx-license-ids";

// Common licenses that are generally safe for commercial use
const SAFE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
  "CC0-1.0",
  "0BSD",
  "BSL-1.0",
  "PostgreSQL",
]);

// Licenses that often cause compliance headaches in commercial products
const RISKY_LICENSES = new Set([
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-2.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "GPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "AGPL-3.0",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "LGPL-3.0",
  "MPL-2.0",
  "EUPL-1.2",
  "CPAL-1.0",
  "OSL-3.0",
]);

const SPDX_SET = new Set(spdxLicenseIds);

/**
 * Normalize a license string to SPDX identifier.
 * "MIT", "mit", "MIT*" -> "MIT", "(MIT OR Apache-2.0)" -> "MIT OR Apache-2.0"
 */
function normalizeLicense(license: string): string {
  if (!license) return "";

  let normalized = license.trim();

  // Remove enclosing parentheses
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Remove SPDX+ notation
  normalized = normalized.replace(/\+$/, "");

  // Handle "OR" expressions — take the most permissive
  if (normalized.includes(" OR ")) {
    const parts = normalized.split(/\s+OR\s+/);
    // Return the safest one (MIT, Apache, BSD, etc.)
    for (const part of parts) {
      const clean = part.replace(/\+$/, "").trim();
      if (SAFE_LICENSES.has(clean)) return clean;
    }
    // If none safe, return the first
    return parts[0].replace(/\+$/, "").trim();
  }

  return normalized;
}

/**
 * Split a compound license string like "MIT OR Apache-2.0" into individual IDs.
 */
function getLicenseIds(license: string): string[] {
  return license
    .split(/\s+(?:OR|AND|WITH)\s+/)
    .map((s) => s.trim().replace(/\+$/, ""))
    .filter(Boolean);
}

/**
 * Analyze a package's license for risk.
 */
export function analyzeLicense(licenseInput: string | string[] | Record<string, any> | null | undefined): {
  license: string | null;
  isRisky: boolean;
  reason?: string;
} {
  if (!licenseInput) {
    return { license: null, isRisky: false };
  }

  // Handle array license (e.g. ["MIT"])
  if (Array.isArray(licenseInput)) {
    const valid = licenseInput.filter(Boolean);
    if (valid.length === 0) return { license: null, isRisky: false };
    return analyzeLicense(valid[0]);
  }

  // Handle object license (e.g. {type: "MIT", url: "..."})
  if (typeof licenseInput === "object") {
    const obj = licenseInput as Record<string, any>;
    if (typeof obj.type === "string") {
      return analyzeLicense(obj.type);
    }
    return { license: null, isRisky: false };
  }

  const license = normalizeLicense(licenseInput);
  if (!license) {
    return { license: null, isRisky: false };
  }

  // Check if it's a valid SPDX identifier
  const licenseIds = getLicenseIds(license);

  for (const id of licenseIds) {
    if (RISKY_LICENSES.has(id)) {
      return {
        license,
        isRisky: true,
        reason: `${id} is a copyleft license that may require derivative works to be licensed under the same terms`,
      };
    }
  }

  // Check if the license is known but not in our safe list (could be niche but fine)
  if (licenseIds.some((id) => SPDX_SET.has(id))) {
    // Known SPDX license — not in risky set, so assume safe
    return { license, isRisky: false };
  }

  // Unknown/unrecognized license — flag it
  if (license.toLowerCase() !== "unlicensed" && license !== "UNLICENSED") {
    return {
      license,
      isRisky: true,
      reason: `Unknown license "${license}". Verify compatibility with your legal team.`,
    };
  }

  return { license, isRisky: false };
}
