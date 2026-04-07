const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

/**
 * Auth refresher hook installed by AuthContext. When a request comes back 401
 * with a Bearer token attached, api() calls this once to obtain a fresh access
 * token and retries the request. Concurrent 401s share the same in-flight
 * refresh promise so we never fire multiple parallel refreshes.
 */
type AuthRefresher = () => Promise<string | null>;
let authRefresher: AuthRefresher | null = null;
let inflightRefresh: Promise<string | null> | null = null;

export function setAuthRefresher(fn: AuthRefresher | null) {
  authRefresher = fn;
}

async function refreshOnce(): Promise<string | null> {
  if (!authRefresher) return null;
  if (!inflightRefresh) {
    inflightRefresh = authRefresher().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  token: string
): Promise<T> {
  const doFetch = (bearer: string) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      body: formData,
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const fresh = await refreshOnce();
    if (fresh) {
      res = await doFetch(fresh);
    }
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data as T;
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token } = options;

  const buildHeaders = (bearer: string | undefined): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (bearer) h["Authorization"] = `Bearer ${bearer}`;
    return h;
  };

  const doFetch = (bearer: string | undefined) =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: buildHeaders(bearer),
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(token);

  // Only attempt a refresh+retry when the original call was authenticated.
  if (res.status === 401 && token) {
    const fresh = await refreshOnce();
    if (fresh) {
      res = await doFetch(fresh);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data as T;
}
