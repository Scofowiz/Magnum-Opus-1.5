const rawApiBase = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export const API_BASE = rawApiBase.replace(/\/+$/, "");

export function withApiBase(path: string): string {
  if (!API_BASE) {
    return path;
  }

  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
