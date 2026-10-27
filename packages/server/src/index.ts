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
export type RuntimeModel = {
  slot: string; slotType: string; slotIndex: number; interface: string;
  endpoint: string; model: string; displayName: string; iconUrl: string; description: string;
  traits: string[]; supportsVision: boolean; supportsThinking: boolean; supportsTools: boolean;
  /** Original protobuf type: int64; protojson and the SDK use a decimal string. */
  contextWindow: string; maxInputTokens: string; maxOutputTokens: string; dimensions: string;
  activity: string; busyLevel: string; updatedAt: string;
  declared: boolean; bound: boolean; status: string;
  /** Original protobuf type: int64; keep IDs as strings in Node.js too. */
  iconFileId: string;
  supportsAudio: boolean; supportsImageInput: boolean; supportsMultimodal: boolean;
};
export type RuntimeSetting = { type: string; required: boolean; value: string };
export type RuntimeConfig = {
  schemaVersion: number;
  /** Original protobuf type: int64; do not coerce to JavaScript number. */
  revision: string;
  updatedAt: string;
  application: Record<string, unknown>;
  settings: Record<string, RuntimeSetting>; models: Record<string, RuntimeModel>;
  storage: Record<string, unknown>; tenant: Record<string, unknown>; features: Record<string, unknown>;
};
/** Skill 文件的非敏感清单和摘要；原始 protobuf int64 的 size 保持字符串。 */
export type RuntimeSkillFile = { path: string; size: string; sha256: string; mediaType: string };
/** 当前 service 可见的 MCP/Skill 目录投影。 */
export type RuntimeCapability = {
  id: string; kind: string; key: string; name: string; description: string;
  source: string; version: string; digest: string; endpoint: string; path: string;
  transport: string; protocolVersion: string; scope: string; restricted: boolean;
  status: string; files: RuntimeSkillFile[];
};
/** 按需读取的 Skill 文件正文。 */
export type RuntimeSkillFileContent = { file: RuntimeSkillFile; body: Uint8Array };
export type ModelAttribution =
  | { kind: "platform"; tenantId: number; userId: number }
  | { kind: "external"; externalUserId: string }
  | { kind: "other" };
export type ObjectStorageConfig = {
  endpoint: string; region: string; accessKey: string; secretKey: string; bucket: string; sharedBuckets: string[];
};
export type ApplicationConfig = { id: string; name: string; version: string; platformEndpoint: string };
export type Config = {
  platformEndpoint?: string; appId?: string; appToken?: string; environment?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch; cacheTTL?: number; serviceName?: string;
};

export class MetisError extends Error {
  constructor(public reason: string, message: string, public status = 0) { super(message); }
}

type CacheEntry = { expires: number; value: unknown };

export class Client {
  private readonly endpoint: URL;
  private readonly appId: string;
  private readonly token: string;
  private readonly service: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly ttl: number;
  private readonly env: Record<string, string | undefined>;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: Config = {}) {
    const env = config.environment ?? (typeof process === "undefined" ? {} : process.env);
    const endpoint = config.platformEndpoint || env.METIS_PLATFORM_ENDPOINT || "";
    this.appId = config.appId || env.METIS_APP_ID || "";
    this.token = config.appToken || env.METIS_APP_TOKEN || "";
    this.service = config.serviceName || env.METIS_SERVICE_NAME || "";
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
  async runtimeConfig(refresh = false): Promise<RuntimeConfig> {
    if (!this.service.trim()) throw new MetisError("MISSING_CONFIG", "METIS_SERVICE_NAME is required");
    const result = await this.get<{ schemaVersion?: number; revision?: string; updatedAt?: string; application?: Record<string, unknown>; config?: Partial<RuntimeConfig> }>("/api/runtime/v1/config", refresh, { "X-Metis-Service": this.service });
    const config = result.config || {};
    const models = config.models || {};
    return { schemaVersion: result.schemaVersion || 0, revision: result.revision || "", updatedAt: result.updatedAt || "", application: result.application || {}, settings: config.settings || {}, models, storage: config.storage || {}, tenant: config.tenant || {}, features: config.features || {} };
  }
  /** 列出当前 service 可见的 MCP 和 Skill。 */
  async listCapabilities(refresh = false): Promise<RuntimeCapability[]> {
    const result = await this.get<{ capabilities?: Record<string, unknown>[] }>(`/api/runtime/v1/capabilities?app_id=${encodeURIComponent(this.appId)}`, refresh);
    return (result.capabilities || []).map((value) => ({
      id: proto64String(value.id, "id"), kind: String(value.kind || ""), key: String(value.key || ""),
      name: String(value.name || ""), description: String(value.description || ""), source: String(value.source || ""),
      version: String(value.version || ""), digest: String(value.digest || ""), endpoint: String(value.endpoint || ""),
      path: String(value.path || ""), transport: String(value.transport || ""), protocolVersion: String(value.protocolVersion || ""),
      scope: String(value.scope || ""), restricted: Boolean(value.restricted), status: String(value.status || ""),
      files: Array.isArray(value.files) ? value.files.map((file) => runtimeSkillFile(file as Record<string, unknown>)) : [],
    }));
  }
  /** 按当前启用版本的摘要清单读取 Skill 文件正文。 */
  async readSkillFile(skillKey: string, path: string, refresh = false): Promise<RuntimeSkillFileContent> {
    if (!skillKey.trim() || !path.trim()) throw new MetisError("INVALID_CONFIG", "skill key and path are required");
    const query = new URLSearchParams({ app_id: this.appId, skill_key: skillKey, path });
    const result = await this.get<{ file?: Record<string, unknown>; body?: string }>(`/api/runtime/v1/skill-files?${query.toString()}`, refresh);
    const body = result.body || "";
    let decoded: string;
    try { decoded = atob(body); } catch (error) { throw new MetisError("UPSTREAM_FAILURE", `runtime skill file body is invalid: ${String(error)}`, 502); }
    return { file: runtimeSkillFile(result.file || {}), body: Uint8Array.from(decoded, (character) => character.charCodeAt(0)) };
  }
  /** 调用平台 MCP 的 tools/call，返回工具 result 的 JSON 值。 */
  async callPlatformMCPTool(name: string, argumentsValue: Record<string, unknown> = {}): Promise<unknown> {
    name = name.trim();
    if (!name) throw new MetisError("INVALID_CONFIG", "platform MCP tool name is required");
    const response = await this.fetcher(new URL("/mcp/v1/platform", this.endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", Accept: "application/json",
        "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": name,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: "metis-sdk-1", method: "tools/call", params: { name, arguments: argumentsValue } }),
    });
    let payload: Record<string, unknown> = {};
    try { payload = await response.json() as Record<string, unknown>; } catch { throw new MetisError("MCP_INVALID_RESPONSE", "platform MCP response is invalid", 502); }
    if (!response.ok) throw new MetisError(String(payload.reason || "MCP_UPSTREAM_FAILURE"), String(payload.message || "platform MCP request failed"), response.status);
    if (payload.error && typeof payload.error === "object") throw new MetisError("MCP_ERROR", String((payload.error as Record<string, unknown>).message || "platform MCP tool failed"), 502);
    if (!("result" in payload)) throw new MetisError("MCP_INVALID_RESPONSE", "platform MCP result is missing", 502);
    return payload.result;
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
  private async get<T>(path: string, refresh: boolean, extraHeaders: Record<string, string> = {}): Promise<T> {
    const cached = this.cache.get(path);
    if (!refresh && cached && cached.expires > Date.now()) return cached.value as T;
    const response = await this.fetcher(new URL(path, this.endpoint), { headers: { Authorization: `Bearer ${this.token}`, ...extraHeaders } });
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

function proto64String(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new MetisError("UPSTREAM_FAILURE", `runtime field ${field} must be a protobuf 64-bit integer string`, 502);
  return value;
}

function runtimeSkillFile(value: Record<string, unknown>): RuntimeSkillFile {
  return { path: String(value.path || ""), size: proto64String(value.size, "size"), sha256: String(value.sha256 || ""), mediaType: String(value.mediaType || "") };
}

export function fromEnv(): Client { return new Client(); }

export function contextFromHeaders(headers: Headers | Record<string, string | undefined>): RequestContext {
  const get = (name: string): string => headers instanceof Headers ? headers.get(name) || "" : Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "";
  return { tenantId: get("X-Platform-Tenant-Id"), userId: get("X-Platform-User-Id"), role: get("X-Platform-Role"), sourceAppId: get("X-Platform-Source-App-Id"), actorType: get("X-Platform-Actor-Type") };
}

export function contextFromRequest(request: Request): RequestContext { return contextFromHeaders(request.headers); }

export function withPlatformIdentity(
  tenantId: number,
  userId: number,
): Extract<ModelAttribution, { kind: "platform" }> {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) {
    throw new MetisError("INVALID_CONFIG", "platform tenant and user ids must be positive integers");
  }
  return { kind: "platform", tenantId, userId };
}

export function platformIdentityFromHeaders(headers: Headers | Record<string, string | undefined>): ModelAttribution {
  const context = contextFromHeaders(headers);
  if (!/^[1-9]\d*$/.test(context.tenantId.trim()) || !/^[1-9]\d*$/.test(context.userId.trim())) {
    throw new MetisError("INVALID_CONFIG", "headers do not contain a valid platform identity");
  }
  return withPlatformIdentity(Number(context.tenantId), Number(context.userId));
}

export function platformIdentityFromRequest(request: Request): ModelAttribution {
  return platformIdentityFromHeaders(request.headers);
}

export function withExternalUser(externalUserId: string): Extract<ModelAttribution, { kind: "external" }> {
  externalUserId = externalUserId.trim();
  const bytes = new TextEncoder().encode(externalUserId).byteLength;
  if (bytes === 0 || bytes > 128 || /\p{Cc}/u.test(externalUserId)) {
    throw new MetisError("INVALID_CONFIG", "external user id must be 1-128 bytes without control characters");
  }
  return { kind: "external", externalUserId };
}

export function withoutUserAttribution(): Extract<ModelAttribution, { kind: "other" }> { return { kind: "other" }; }

export function newModelRequest(
  config: ModelConfig,
  method: string,
  requestPath: string,
  attribution: ModelAttribution,
  body?: BodyInit,
): Request {
  const endpoint = config.endpoint.trim().replace(/\/$/, "");
  requestPath = requestPath.trim();
  if (!endpoint || !config.apiKey || !requestPath.startsWith("/") || requestPath.startsWith("//")) {
    throw new MetisError("INVALID_CONFIG", "model endpoint, API key and absolute request path are required");
  }
  const headers = new Headers({ Authorization: `Bearer ${config.apiKey}` });
  switch (attribution.kind) {
    case "platform": {
      const identity = withPlatformIdentity(attribution.tenantId, attribution.userId);
      headers.set("X-Platform-Tenant-Id", String(identity.tenantId));
      headers.set("X-Platform-User-Id", String(identity.userId));
      break;
    }
    case "external":
      headers.set("X-Platform-External-User-Id", withExternalUser(attribution.externalUserId).externalUserId);
      break;
    case "other":
      break;
    default:
      throw new MetisError("INVALID_CONFIG", "model attribution is required");
  }
  try { return new Request(endpoint + requestPath, { method, body, headers }); }
  catch (error) { throw new MetisError("INVALID_CONFIG", `model request is invalid: ${String(error)}`); }
}
