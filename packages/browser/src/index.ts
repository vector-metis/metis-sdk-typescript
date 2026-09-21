/** 平台注入浏览器能力的公开类型。 */
export interface BrowserContext {
  appId: string;
  appType: "RUNTIME_APPLICATION_TYPE_WEB";
  version: string;
  tenantId: string;
  userId: string;
  role: string;
  actorType: "RUNTIME_ACTOR_TYPE_USER";
  locale?: string;
  theme?: string;
  viewport?: { width: number; height: number };
  route?: string;
}

/** source 应用声明的 Web 依赖。 */
export interface WebDependency {
  appId: string;
  alias: string;
  required: boolean;
  requestedVersion: string;
  resolvedVersion: string;
  packageSha256: string;
  direct: boolean;
  resolutionError: string;
  appType: "RUNTIME_APPLICATION_TYPE_WEB";
  available: boolean;
  webBasePath: string;
}

export type ToastOptions = {
  level?: "success" | "info" | "warning" | "error";
  message: string;
};

export type BrowserEventName =
  | "context.changed"
  | "route.changed"
  | "sidebar.visibility.changed"
  | "platform.auth.required";

/** 平台注入脚本暴露的能力接口。 */
export interface InjectedBrowserSDK {
  appURL(path?: string): string;
  getContext(): Promise<BrowserContext>;
  listDependencies(): Promise<WebDependency[]>;
  dependency(aliasOrAppId: string): Promise<WebDependency>;
  dependencyURL(aliasOrAppId: string, path?: string): Promise<string>;
  openAppPage(options: { app: string; path?: string; query?: Record<string, string> }): Promise<void>;
  ui: {
    sidebar: { hide(): Promise<void>; show(): Promise<void> };
    toast: { show(options: ToastOptions): Promise<void> };
  };
  on(name: BrowserEventName, callback: (value: unknown) => void): () => void;
}

declare global {
  interface Window {
    Metis?: InjectedBrowserSDK;
    MetisReady?: Promise<InjectedBrowserSDK>;
  }
}

export type BrowserSDKInitOptions = {
  /** Same-origin by default; override for local development or a platform proxy. */
  scriptUrl?: string;
  /** Optional CSP nonce for the dynamically-created script element. */
  nonce?: string;
  /** Milliseconds to wait for the platform script before rejecting. */
  timeoutMs?: number;
};

let initialization: Promise<InjectedBrowserSDK> | undefined;

function validateSDK(value: unknown): InjectedBrowserSDK {
  if (!value || typeof value !== "object") {
    throw new Error("Metis browser SDK loaded without a valid window.Metis object");
  }
  const sdk = value as Partial<InjectedBrowserSDK>;
  const methods: Array<keyof InjectedBrowserSDK> = [
    "appURL",
    "getContext",
    "listDependencies",
    "dependency",
    "dependencyURL",
    "openAppPage",
  ];
  if (methods.some((method) => typeof sdk[method] !== "function")) {
    throw new Error("Metis browser SDK loaded without the required platform methods");
  }
  if (!sdk.ui || typeof sdk.ui !== "object" || typeof sdk.ui.sidebar?.hide !== "function" || typeof sdk.ui.sidebar?.show !== "function" || typeof sdk.ui.toast?.show !== "function" || typeof sdk.on !== "function") {
    throw new Error("Metis browser SDK loaded without interaction capabilities");
  }
  return sdk as InjectedBrowserSDK;
}

async function waitForHost(browserWindow: Window): Promise<InjectedBrowserSDK> {
  const ready = browserWindow.MetisReady;
  if (ready && typeof ready.then === "function") return validateSDK(await ready);
  return validateSDK(browserWindow.Metis);
}

/** Load the platform-injected browser capabilities and return a ready SDK. */
export function init(options: BrowserSDKInitOptions = {}): Promise<InjectedBrowserSDK> {
  if (initialization) {
    return initialization;
  }

  const browserWindow = globalThis.window;
  const document = globalThis.document;
  if (!browserWindow) {
    return Promise.reject(new Error("Metis browser SDK requires a browser environment"));
  }

  if (browserWindow.Metis) {
    return waitForHost(browserWindow);
  }
  if (!document) {
    return Promise.reject(new Error("Metis browser SDK requires a browser document"));
  }

  const timeoutMs = options.timeoutMs ?? 10000;
  const script = document.createElement("script");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveInitialization!: (sdk: InjectedBrowserSDK) => void;
  let rejectInitialization!: (error: Error) => void;
  initialization = new Promise<InjectedBrowserSDK>((resolve, reject) => {
    resolveInitialization = resolve;
    rejectInitialization = reject;
  });
  const pending = initialization!;
  const fail = (error: Error) => {
    if (timer) clearTimeout(timer);
    initialization = undefined;
    rejectInitialization(error);
  };

  script.src = options.scriptUrl ?? "/api/runtime/v1/browser-sdk.js";
  script.async = true;
  if (options.nonce) script.nonce = options.nonce;
  script.onload = () => {
    void waitForHost(browserWindow).then((sdk) => {
      if (timer) clearTimeout(timer);
      initialization = undefined;
      resolveInitialization(sdk);
    }).catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
  };
  script.onerror = () => fail(new Error(`Failed to load Metis browser SDK: ${script.src}`));
  timer = setTimeout(() => fail(new Error(`Metis browser SDK load timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    document.head.appendChild(script);
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)));
  }

  return pending;
}

export type MetisBrowserContext = BrowserContext;
export type MetisBrowserSDK = InjectedBrowserSDK;
export type MetisWebDependency = WebDependency;
