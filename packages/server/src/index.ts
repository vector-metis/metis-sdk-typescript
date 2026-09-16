declare const process: { env: Record<string, string | undefined> } | undefined;

export type Dependency = {
  appId: string; alias: string; required: boolean;
  requestedVersion: string; resolvedVersion: string; packageSha256: string;
  available: boolean; direct: boolean; resolutionError: string;
  appType: string; webBasePath: string;
};
export type ServiceEndpoint = {
  appId: string; endpointName: string; protocol: string; host: string; port: number; available: boolean;
};
export type RequestContext = {
  tenantId: string; userId: string; role: string; sourceAppId: string; actorType: string;
};
export type ModelConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsTools: boolean;
  contextWindow: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  dimensions: number;
  normalized: boolean;
};
export type ObjectStorageConfig = {
  endpoint: string; region: string; accessKey: string; secretKey: string; bucket: string; sharedBuckets: string[];
};
export type ApplicationConfig = { id: string; name: string; version: string; platformEndpoint: string };
export type Config = {
  platformEndpoint?: string; appId?: string; appToken?: string; environment?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch; cacheTTL?: number;
};

export class MetisError extends Error {
  constructor(public reason: string, message: string, public status = 0) { super(message); }
}

type CacheEntry = { expires: number; value: unknown };

export class Client {
  private readonly endpoint: URL;
  private readonly appId: string;
  private readonly token: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly ttl: number;
  private readonly env: Record<string, string | undefined>;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: Config = {}) {
    const env = config.environment ?? (typeof process === "undefined" ? {} : process.env);
    const endpoint = config.platformEndpoint || env.METIS_PLATFORM_ENDPOINT || "";
    this.appId = config.appId || env.METIS_APP_ID || "";
    this.token = config.appToken || env.METIS_APP_TOKEN || "";
    if (!endpoint || !this.appId || !this.token) throw new MetisError("MISSING_CONFIG", "METIS_PLATFORM_ENDPOINT, METIS_APP_ID and METIS_APP_TOKEN are required");
    try { this.endpoint = new URL(endpoint); } catch { throw new MetisError("INVALID_CONFIG", "METIS_PLATFORM_ENDPOINT must be an absolute HTTP URL"); }
    if (!/^https?:$/.test(this.endpoint.protocol)) throw new MetisError("INVALID_CONFIG", "METIS_PLATFORM_ENDPOINT must be an absolute HTTP URL");
    this.fetcher = config.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new MetisError("MISSING_CONFIG", "fetch implementation is required");
    this.ttl = config.cacheTTL ?? 30_000;
    if (this.ttl < 0) throw new MetisError("INVALID_CONFIG", "cacheTTL cannot be negative");
    this.env = env;
  }

  async listDependencies(refresh = false): Promise<Dependency[]> {
    const result = await this.get<{dependencies?: Dependency[]}>(this.path("dependencies"), refresh);
    return result.dependencies ?? [];
  }
  dependency(selector: string, refresh = false): Promise<Dependency> {
    return this.get(this.path("dependencies", selector), refresh);
  }
  async webURL(selector: string, path = ""): Promise<string> {
    const dependency = await this.dependency(selector);
    if (!dependency.available || !dependency.webBasePath) throw new MetisError("DEPENDENCY_UNAVAILABLE", "web dependency is unavailable", 503);
    return this.join(dependency.webBasePath, path);
  }
  async newWebRequest(selector: string, method: string, path = "", body?: BodyInit): Promise<Request> {
    return new Request(await this.webURL(selector, path), { method, body, headers: { Authorization: `Bearer ${this.token}` } });
  }
  serviceEndpoint(selector: string, endpointName: string, refresh = false): Promise<ServiceEndpoint> {
    return this.get(this.path("dependencies", selector, "endpoints", endpointName), refresh);
  }
  private parseModelSlot(slot: string): ModelConfig | null {
    const match = /^(llm|embedding|rerank)\.(\d+)$/.exec(slot);
    if (!match) return null;
    const prefix = `METIS_${match[1].toUpperCase()}_${match[2]}_`;
    const endpoint = this.env[`${prefix}ENDPOINT`];
    const model = this.env[`${prefix}MODEL`];
    const apiKey = this.env[`${prefix}API_KEY`];
    if (!endpoint || !model || !apiKey) return null;

    const toInt = (suffix: string) => {
      const v = parseInt(this.env[`${prefix}${suffix}`] || "0", 10);
      return Number.isNaN(v) ? 0 : v;
    };
    const toBool = (suffix: string) => (this.env[`${prefix}${suffix}`] || "").trim().toLowerCase() === "true";

    return {
      endpoint,
      model,
      apiKey,
      supportsVision: toBool("SUPPORTS_VISION"),
      supportsThinking: toBool("SUPPORTS_THINKING"),
      supportsTools: toBool("SUPPORTS_TOOLS"),
      contextWindow: toInt("CONTEXT_WINDOW"),
      maxInputTokens: toInt("MAX_INPUT_TOKENS"),
      maxOutputTokens: toInt("MAX_OUTPUT_TOKENS"),
      dimensions: toInt("DIMENSIONS"),
      normalized: toBool("NORMALIZED"),
    };
  }

  model(slot: string): ModelConfig {
    const match = /^(llm|embedding|rerank)\.(\d+)$/.exec(slot);
    if (!match) throw new MetisError("INVALID_CONFIG", `invalid model slot ${slot}`);
    const config = this.parseModelSlot(slot);
    if (!config) throw new MetisError("MISSING_CONFIG", `model slot ${slot} is incomplete`);
    return config;
  }

  tryModel(slot: string): ModelConfig | null {
    return this.parseModelSlot(slot);
  }

  models(modelType: string): ModelConfig[] {
    if (modelType !== "llm" && modelType !== "embedding" && modelType !== "rerank") {
      throw new MetisError("INVALID_CONFIG", `invalid model type ${modelType}`);
    }
    const result: ModelConfig[] = [];
    for (let i = 0; i < 10; i++) {
      const config = this.parseModelSlot(`${modelType}.${i}`);
      if (config) {
        result.push(config);
      }
    }
    return result;
  }
  objectStorage(): ObjectStorageConfig {
    const value = (name: string) => this.env[name] || "";
    const result = { endpoint: value("METIS_S3_ENDPOINT"), region: value("METIS_S3_REGION"), accessKey: value("METIS_S3_ACCESS_KEY"), secretKey: value("METIS_S3_SECRET_KEY"), bucket: value("METIS_S3_BUCKET"), sharedBuckets: [] as string[] };
    if (!result.endpoint || !result.accessKey || !result.secretKey || !result.bucket) throw new MetisError("MISSING_CONFIG", "object storage config is incomplete");
    try { result.sharedBuckets = JSON.parse(value("METIS_S3_SHARED_BUCKETS") || "[]"); } catch { throw new MetisError("INVALID_CONFIG", "METIS_S3_SHARED_BUCKETS must be a JSON string array"); }
    if (!Array.isArray(result.sharedBuckets) || result.sharedBuckets.some((item) => typeof item !== "string")) throw new MetisError("INVALID_CONFIG", "METIS_S3_SHARED_BUCKETS must be a JSON string array");
    return result;
  }

  application(): ApplicationConfig {
    return {
      id: this.appId,
      name: this.env.METIS_APP_NAME || "",
      version: this.env.METIS_APP_VERSION || "",
      platformEndpoint: this.endpoint.toString().replace(/\/$/, ""),
    };
  }
  setting(key: string): string {
    if (!key.trim()) throw new MetisError("INVALID_CONFIG", "setting key is required");
    const name = `METIS_SETTING_${key.trim().toUpperCase().replace(/[. -]/g, "_")}`;
    const value = this.env[name];
    if (value === undefined) throw new MetisError("MISSING_CONFIG", `setting ${key} is not injected`);
    return value;
  }
  entryPort(): number { return this.port("METIS_ENTRY_PORT"); }
  endpointPort(name: string): number {
    if (!name.trim()) throw new MetisError("INVALID_CONFIG", "endpoint name is required");
    return this.port(`METIS_ENDPOINT_${name.trim().toUpperCase().replace(/-/g, "_")}_PORT`);
  }
  private port(name: string): number {
    const value = Number(this.env[name]);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new MetisError("MISSING_CONFIG", `${name} is not a valid port`);
    return value;
  }

  private path(...parts: string[]): string { return `/api/runtime/v1/apps/${encodeURIComponent(this.appId)}/${parts.map((part) => encodeURIComponent(part.trim())).join("/")}`; }
  private join(base: string, path: string): string {
    if (path.includes("://") || path.startsWith("//")) throw new MetisError("INVALID_CONFIG", "dependency path must be relative");
    let decoded: string;
    try { decoded = decodeURIComponent(path.split(/[?#]/, 1)[0] ?? ""); }
    catch { throw new MetisError("INVALID_CONFIG", "dependency path encoding is invalid"); }
    if (decoded.includes("\\") || decoded.split("/").some((part) => part === "." || part === "..")) {
      throw new MetisError("INVALID_CONFIG", "dependency path must stay within the application root");
    }
    return new URL(`${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, this.endpoint).toString();
  }
  private async get<T>(path: string, refresh: boolean): Promise<T> {
    const cached = this.cache.get(path);
    if (!refresh && cached && cached.expires > Date.now()) return cached.value as T;
    const response = await this.fetcher(new URL(path, this.endpoint), { headers: { Authorization: `Bearer ${this.token}` } });
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; }
    catch {
      if (response.ok) throw new MetisError("UPSTREAM_FAILURE", "runtime response is invalid", 502);
    }
    if (!response.ok) throw new MetisError(String(body.reason || "UPSTREAM_FAILURE"), String(body.message || "runtime request failed"), response.status);
    if (this.ttl > 0) this.cache.set(path, { expires: Date.now() + this.ttl, value: body });
    return body as T;
  }
}

export function fromEnv(): Client { return new Client(); }

export function contextFromHeaders(headers: Headers | Record<string, string | undefined>): RequestContext {
  const get = (name: string): string => headers instanceof Headers ? headers.get(name) || "" : Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "";
  return { tenantId: get("X-Platform-Tenant-Id"), userId: get("X-Platform-User-Id"), role: get("X-Platform-Role"), sourceAppId: get("X-Platform-Source-App-Id"), actorType: get("X-Platform-Actor-Type") };
}

export function contextFromRequest(request: Request): RequestContext { return contextFromHeaders(request.headers); }
