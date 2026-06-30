import dotenv from "dotenv";

dotenv.config();

export interface DepBlastConfig {
  /** GitHub App ID */
  appId: string;
  /** Path to the private key PEM file */
  privateKeyPath: string;
  /** Webhook secret */
  webhookSecret: string;
  /** Log level */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Maximum transitive depth to resolve */
  maxTransitiveDepth: number;
  /** Size threshold (bytes) above which to flag as large */
  largePackageSizeBytes: number;
  /** Minimum maintainer score (1-5) below which to flag */
  minMaintainerScore: number;
  /** Cache TTL for npm registry lookups in ms */
  cacheTtlMs: number;
}

export function loadConfig(): DepBlastConfig {
  return {
    appId: process.env.APP_ID || "",
    privateKeyPath: process.env.PRIVATE_KEY_PATH || "./private-key.pem",
    webhookSecret: process.env.WEBHOOK_SECRET || "",
    logLevel: (process.env.LOG_LEVEL as any) || "info",
    maxTransitiveDepth: parseInt(process.env.MAX_TRANSITIVE_DEPTH || "3", 10),
    largePackageSizeBytes: parseInt(process.env.LARGE_PACKAGE_SIZE_BYTES || "500000", 10),
    minMaintainerScore: parseInt(process.env.MIN_MAINTAINER_SCORE || "3", 10),
    cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || "3600000", 10),
  };
}
