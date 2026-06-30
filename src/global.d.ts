// Type declarations for npm modules without @types packages

declare module "npm-registry-fetch" {
  interface FetchOptions {
    headers?: Record<string, string>;
    method?: string;
    body?: any;
  }

  interface NpmFetchFunction {
    (url: string, opts?: FetchOptions): Promise<Response>;
    json(url: string, opts?: FetchOptions): Promise<any>;
  }

  declare const npmFetch: NpmFetchFunction;
  export default npmFetch;
  export { NpmFetchFunction, FetchOptions };
}

declare module "spdx-license-ids" {
  const ids: string[];
  export default ids;
}
