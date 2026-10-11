const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export const isDemoMode = false;

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (typeof window === "undefined") throw new Error("API requests must be made from the browser.");
  const token = window.localStorage.getItem("college_erp_access_token");
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    let message = "";
    try {
      const errJson = await response.json();
      message = errJson.error || errJson.message || JSON.stringify(errJson);
    } catch {
      message = await response.text().catch(() => "");
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function requireBackendMode() {
  if (isDemoMode) return false;
  return true;
}
