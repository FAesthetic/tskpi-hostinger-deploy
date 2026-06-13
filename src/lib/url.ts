import type { NextRequest } from "next/server";

const LOCAL_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

export function getAppOrigin(request?: NextRequest | Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "https";

    if (host && !LOCAL_HOSTS.has(host.split(":")[0])) {
      return `${proto}://${host}`;
    }

    try {
      const requestUrl = new URL(request.url);

      if (!LOCAL_HOSTS.has(requestUrl.hostname)) {
        return requestUrl.origin;
      }
    } catch {
      // Fall through to local development fallback.
    }
  }

  return "http://localhost:3000";
}

export function appUrl(path: string, request?: NextRequest | Request) {
  return new URL(path, getAppOrigin(request));
}
