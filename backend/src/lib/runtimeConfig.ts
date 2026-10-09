import { isIP } from "node:net";

export function runtimeConfig(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === "production";
  const port = Number(env.PORT ?? "5000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const host = env.HOST?.trim() || "127.0.0.1";
  const appOrigin = env.APP_ORIGIN?.trim();
  if (!appOrigin) throw new Error("APP_ORIGIN is required");
  const origin = new URL(appOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== appOrigin) {
    throw new Error("APP_ORIGIN must be an exact HTTP(S) origin without a trailing slash or path");
  }
  if (production && origin.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }
  if (env.TRUST_PROXY === "render-vercel") {
    const proxySecret = env.ORIGIN_SECRET ?? "";
    if (!production || env.RENDER !== "true" || !/^[a-f0-9]{64,}$/i.test(proxySecret)) {
      throw new Error("render-vercel proxy mode requires production on Render and an ORIGIN_SECRET of at least 64 hexadecimal characters");
    }
    // Only authenticated Vercel requests reach sessions/routes; Vercel overwrites
    // visitor forwarding headers. Keep this mode paired with the API guard.
    return { production, port, host, appOrigin, trustProxy: (_address: string) => true, proxySecret };
  }
  const proxies = (env.TRUST_PROXY ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const proxy of proxies) {
    const [address, prefix, extra] = proxy.split("/");
    const version = isIP(address ?? "");
    if (!version || extra !== undefined || (prefix !== undefined &&
      (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error("TRUST_PROXY must contain specific proxy IP addresses or CIDRs (not true or a hop count)");
    }
  }
  return { production, port, host, appOrigin, trustProxy: proxies.length ? proxies : false as const, proxySecret: undefined };
}
