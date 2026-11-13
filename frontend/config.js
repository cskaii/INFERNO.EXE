// Local development uses the same server for the page and API.
// The Vercel build replaces this with the public BACKEND_URL setting.
globalThis.BLACKOUT_CONFIG = { apiBaseUrl: '' };
