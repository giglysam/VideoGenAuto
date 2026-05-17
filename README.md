# VideoGenAuto

VideoGenAuto is a Vite dashboard for running multiple embedded video-creator sessions
through an iframe/canvas workspace. It was built for an internal environment where the
configured browser/proxy setup permits programmatic iframe DOM access and can be deployed
to Vercel as a static build.

## What it does

- Embeds the configured creator URL in one or more iframe containers.
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

## Important browser-runtime requirement

Browser isolation normally prevents a parent page from reading or controlling a
cross-origin iframe. This app does not disable or bypass browser security. The automation
module expects your own trusted setup to make `iframe.contentDocument` accessible, such as
a same-origin development proxy, an internal controlled browser profile, or another
approved environment.

If iframe DOM access is unavailable, the dashboard can still display the iframe and canvas,
but selector automation and coordinate event dispatch will log an access error.

## Typical workflow

1. Paste one prompt per line, or choose blank-line separated prompt blocks.
2. Choose how many iframe containers to create.
3. Click **Create / reset containers**.
4. If needed, click **Calibrate overlay** on a worker, click points over the iframe, and
   assign those points to Veo, Prompt, Ingredients, Avatar, and Generate.
5. Click **Start video queue**.
6. Download ready videos with each worker's external **Download video** button or with
   **Download all ready videos**.

Selector and coordinate settings can be exported/imported from the header buttons.
