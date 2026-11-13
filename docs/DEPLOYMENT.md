# Vercel frontend + Render backend

The repository is prepared for split hosting. Actual hosting resources and URLs must be created in your accounts. Local `npm start` continues to serve both the page and the API.

## 1. Deploy Render first

Push this repository to GitHub, then create a Render Blueprint from the repository. The root `render.yaml` configures a Node web service, `npm ci`, `npm start`, and `/api/health` health checks. Alternatively create a Web Service manually with the same settings. Leave Root Directory empty (the repository root); do not choose `backend`, because package.json is at the root.

Render environment settings:

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEY` | Your private Google API key |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| `AI_TIMEOUT_MS` | `30000` |
| `SERVE_FRONTEND` | `false` |
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | Your exact Vercel origin, e.g. `https://your-project.vercel.app` |

If you do not know the Vercel origin yet, leave FRONTEND_ORIGIN empty until step 3. Browser API calls will be rejected until it is set. The blueprint prompts for this value; you can reserve/import the Vercel project first to get its domain, or deploy the Render Web Service manually and add the value afterwards.

Do not set PORT manually; Render provides it. Keep one backend instance because sessions and rate-limit counters are stored in process memory. The blueprint selects the free plan; choose a paid instance explicitly if you want to avoid inactivity sleep. Restarts and redeployments discard active sessions on either plan.

After Render deploys, copy its HTTPS origin. Visiting `https://YOUR-RENDER-HOST/api/health` should return `{"ok":true}`. The root page is intentionally not served with SERVE_FRONTEND=false.

## 2. Deploy Vercel

Import the same GitHub repository as a Vercel project:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (leave default), NOT `frontend` |
| Framework Preset | Other |
| Build Command | `npm run build:frontend` (provided by vercel.json) |
| Output Directory | `dist` (provided by vercel.json) |
| Environment variable `BACKEND_URL` | Render HTTPS origin, e.g. `https://your-service.onrender.com` |

BACKEND_URL must not include `/api`, a query, or credentials. Set it for each Vercel environment you intend to deploy. It is a public URL, not a secret. Never add GEMINI_API_KEY to Vercel or frontend files.

The build copies only frontend files into dist and writes a public config.js with the backend origin. It fails clearly if BACKEND_URL is missing or invalid. The browser calls Render directly; no Vercel rewrite or serverless function is required. Changing BACKEND_URL requires a new Vercel deployment.

## 3. Allow the Vercel domain on Render

Set Render's FRONTEND_ORIGIN to the exact browser origin, with no trailing slash or path. Redeploy/restart Render to load changed settings. Multiple origins may be comma-separated (for example your Vercel domain and a custom domain). Preview deployment URLs need explicit allowlisting too; do not use `*` or assume all vercel.app sites are trusted.

The API accepts the Content-Type and X-Session-Id request headers, handles preflights, exposes Retry-After, and sends Cache-Control: no-store. Sessions use a header rather than cross-site cookies.

## 4. Verify the hosted game

1. Open the Vercel URL and start a fresh mission.
2. Confirm requests go to the Render origin and succeed, including OPTIONS preflights.
3. Complete the cipher, read required files, ask suggested and custom AI questions, then finish the recovery stage.
4. Confirm live dialogue rather than the backup dialogue notice. `/api/health` verifies the server only, not Google connectivity.
5. Refresh during a mission, then test two teams separately, expiry, and the next-team reset.

For the free Render plan, open the health endpoint before the event and allow the server to wake up before starting players. A cold start can exceed the frontend's 10-second request timeout; retry deliberately after it is awake. No background keep-awake service is configured. For a reliable event start without inactivity sleep, consider a paid instance.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Vercel build fails with BACKEND_URL error | Add the public Render HTTPS origin in Vercel and redeploy |
| Frontend origin is not allowed | Exact Vercel origin in Render FRONTEND_ORIGIN; restart Render |
| Requests target the Vercel host | Confirm config.js loaded before app.js and the new build was deployed |
| API health works, AI uses fallback | Render key/model settings and provider quota; inspect Render logs or run the AI diagnostic in a suitable environment |
| Session disappears after deployment | Expected with in-memory sessions; do not redeploy during games |
| First request times out after inactivity | Let Render wake up, then retry; consider a plan without inactivity sleep |

## Automated verification

`npm test` covers mission behavior, split-origin request routing, CORS/preflight responses, URL validation and the static build's public-only output. `npm run build:frontend` requires BACKEND_URL in the current build environment. `.env` is backend-only and is not read by this build script.
