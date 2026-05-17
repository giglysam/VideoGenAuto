# VideoGenAuto

VideoGenAuto is a Vite dashboard for running embedded video-creator sessions through
iframe/canvas workspaces. The UI is intentionally simple: choose how many canvases you
want, paste prompts, create the canvases, and run the queue.

## What it does

- Embeds the configured creator URL in one or more iframe/canvas containers.
- Places a calibrated HTML5 canvas directly over each iframe.
- Accepts a main prompt queue and assigns prompts across available containers.
- Uses DOM selectors from the provided Veo/Google markup to:
  - open the Veo / AI video panel,
  - locate and fill the prompt textarea,
  - dispatch input/change events,
  - optionally click Avatar or Ingredients controls,
  - click Generate,
  - discover generated `video[src]` candidates.
- Falls back to calibrated X/Y iframe coordinates when selectors drift.
- Shows a download button outside each iframe once a generated video URL is found.

## Running locally with Vite

Install dependencies:

```bash
npm install
```

This project targets Node.js 18 or newer.

Start the development server:

```bash
npm run dev
```

Then open the URL printed by Vite, usually:

```text
http://localhost:5173
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Preview usually serves:

```text
http://localhost:4173
```

## Publishing on Vercel

The repository includes `vercel.json` with:

- install command: `npm install`
- build command: `npm run build`
- output directory: `dist`

In Vercel, import the GitHub repository and keep the default Vite/static settings. Vercel
will run the build and publish the generated `dist` folder.

The default target URL is:

```text
https://docs.google.com/videos/u/0/create?usp=vids_home
```

## Important Google access requirement

If the embedded Google page says "You need access", the browser is not authenticated with
a Google account that can use that creator URL. A Vercel frontend cannot add, spoof, or
override Google authentication headers for an iframe. The iframe must use the user's real
Google session cookies.

Use the **Open Google sign-in tab** button, sign in with the correct account, then return
to the app and click **Refresh iframes**.

Browser isolation can also prevent a parent page from reading or controlling a
cross-origin iframe. This app does not disable or bypass browser security. The automation
module expects your own trusted setup to make `iframe.contentDocument` accessible, such as
a same-origin development proxy, an internal controlled browser profile, or another
approved environment.

If iframe DOM access is unavailable, the dashboard can still display the iframe and canvas,
but selector automation and coordinate event dispatch will log an access error.

## Typical workflow

1. Click **Open Google sign-in tab** and make sure the correct account has access.
2. Choose how many canvases to create.
3. Paste one prompt per line.
4. Click **Create canvases**.
5. Click **Start**.
6. If Google still shows the access page, finish sign-in in the Google tab and click
   **Refresh iframes**.
7. Download ready videos with each worker's external **Download video** button or with
   **Download all ready videos**.

Selector and coordinate settings are available in the collapsed advanced settings section.
