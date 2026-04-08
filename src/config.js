// Base URL for the Morning Scroll Cloudflare Worker API.
// Override in local dev via VITE_WORKER_URL in .env.local
export const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787";
