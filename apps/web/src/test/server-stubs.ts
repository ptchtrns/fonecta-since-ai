// Stand-ins for `server-only` and `cloudflare:workers`, which only exist inside the app's build. Tests that import
// server modules mock what those modules would reach (D1, Yext) themselves.
export const env: Record<string, unknown> = {};
export default {};
