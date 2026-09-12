/** 平台注入浏览器能力的公开类型。 */
export interface BrowserContext {
  appId: string;
  appType: "RUNTIME_APPLICATION_TYPE_WEB";
  tenantId: string;
  userId: string;
  role: string;
  actorType: "RUNTIME_ACTOR_TYPE_USER";
}

/** source 应用声明的 Web 依赖。 */
export interface WebDependency {
  appId: string;
  alias: string;
  required: boolean;
  appType: "RUNTIME_APPLICATION_TYPE_WEB";
  available: boolean;
  webBasePath: string;
}

/** 平台注入脚本暴露的能力接口。 */
export interface InjectedBrowserSDK {
  appURL(path?: string): string;
  getContext(): Promise<BrowserContext>;
  listDependencies(): Promise<WebDependency[]>;
  dependency(aliasOrAppId: string): Promise<WebDependency>;
  dependencyURL(aliasOrAppId: string, path?: string): Promise<string>;
  openAppPage(options: { app: string; path?: string; query?: Record<string, string> }): Promise<void>;
}

declare global {
  interface Window {
    Metis?: InjectedBrowserSDK;
  }
}

/** 返回平台已经注入的浏览器能力；脚本缺失时明确失败。 */
export function injected(): InjectedBrowserSDK {
  const sdk = globalThis.window?.Metis;
  if (!sdk) {
    throw new Error("Metis browser SDK is not injected; load /api/runtime/v1/browser-sdk.js first");
  }
  return sdk;
}

/** 对平台注入能力做延迟解析的类型化代理。 */
export const Metis: InjectedBrowserSDK = Object.freeze({
  appURL: (path?: string) => injected().appURL(path),
  getContext: () => injected().getContext(),
  listDependencies: () => injected().listDependencies(),
  dependency: (selector: string) => injected().dependency(selector),
  dependencyURL: (selector: string, path?: string) => injected().dependencyURL(selector, path),
  openAppPage: (options: { app: string; path?: string; query?: Record<string, string> }) => injected().openAppPage(options),
});

export type MetisBrowserContext = BrowserContext;
export type MetisBrowserSDK = InjectedBrowserSDK;
export type MetisWebDependency = WebDependency;
