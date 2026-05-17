# VideoGenAuto

VideoGenAuto is a Vite + Vercel web app for running video-generation prompts from a
website without embedding Google in an iframe and without using a browser extension.

Google blocks `docs.google.com` inside third-party iframes. The working web-only
architecture is:

```text
Vercel website UI -> Vercel API route -> remote authenticated Chrome/Chromium browser
```

The Vercel API connects to the remote browser over a Chrome DevTools Protocol WebSocket
(`BROWSER_WS_ENDPOINT`) using `playwright-core`. That browser must already be signed in to
the Google account that has access to the video creator.

## Features

- Simple website UI: target URL, prompts, parallel tab count, start button, results.
- No iframe dependency.
- No extension dependency.
- Server-side automation route at `api/generate.js`.
- Uses the provided Veo/Google selectors for:
  - opening the Veo button/panel,
  - filling the prompt textarea,
  - clicking Generate,
  - detecting generated video URLs.

## Required environment variable

Set this in Vercel:

```text
BROWSER_WS_ENDPOINT=wss://your-remote-browser-cdp-endpoint
```

The endpoint must point to a remote Chrome/Chromium browser that:

1. Supports CDP / Playwright `chromium.connectOverCDP`.
2. Has a persistent profile/session.
3. Is already logged in to the Google account with video-creator access.

Examples of services that can provide this kind of remote browser:

- Browserless
- Browserbase
- Steel Browser
- A self-hosted Chrome running with `--remote-debugging-port` behind a secure WebSocket
  proxy

Do not put Google passwords into this app. Sign in to the remote browser using the
provider's secure live browser/session tools, then keep that browser profile persistent.

## Running locally

Install dependencies:

```bash
npm install
```

Create a local env file or export the browser endpoint:

```bash
export BROWSER_WS_ENDPOINT="wss://your-remote-browser-cdp-endpoint"
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Vercel deployment

The repo includes `vercel.json`:

- install command: `npm install`
- build command: `npm run build`
- output directory: `dist`
- API max duration for `api/generate.js`: `300`

After importing the repository into Vercel, add `BROWSER_WS_ENDPOINT` in Project Settings
-> Environment Variables and redeploy.

## Notes and limits

- If `BROWSER_WS_ENDPOINT` is missing, the frontend will show "Setup needed".
- Vercel functions have execution time limits. Long video renders may require a provider
  with background jobs/webhooks or a dedicated backend worker if generations take longer
  than the function limit.
- This app cannot bypass Google access controls. The remote browser must use an account
  that legitimately has access.
