# GrovLink Web Clipper — dev stub

A truncated, working slice of the extension described in `GrovLink_Web_Clipper_UI_Concepts.html`
(see the GrovLink project folder) — enough to load in Chrome and confirm the capture → API →
database path actually works, before building out the rest.

## What's actually in this stub

- **Toolbar icon → side panel.** Clicking the icon with nothing selected opens the panel
  with the current tab's title/URL as a page-level capture.
- **Selection bubble.** Highlight text on any page and a "Send to GrovLink" bubble appears
  above it (Screen 6 in the UI concepts doc — the thing Pinterest's clipper doesn't do).
  Clicking it opens the panel with that exact text quoted in.
- **Right-click → Send image to GrovLink.** Captures just the image URL for flyer-only content.
- **Dev login.** A stand-in for real auth (see "What's deliberately left out" below).
- **One real write path.** Saving submits a genuine `POST /admin/events` to your local API,
  landing as a draft (`isActive: false`) in whatever tenant you signed in as.

## What's deliberately left out (for now)

- **Real login.** This stub signs in with your API's *dev* auth headers
  (`x-user-email` / `x-customer-slug` / `x-tenant-slug`), not Cognito. Those headers only
  work when the API's `NODE_ENV !== 'production'` — see
  `api/src/app/auth/dev-auth.guard.ts` in `Nonprofit.Mobile.Platform`. Real Cognito login
  (direct, no backend auth endpoint needed, ~365-day session) is the next piece to build.
- **CTA / Class / Impact story.** The type chips for these are visible but disabled — only
  Event is wired to a real endpoint right now. Same staging-upload + create pattern exists
  for all three on the backend already, so adding them is mostly repeating the Event form,
  not new plumbing.
- **Toolbar quick-capture popup, approval queue, settings page.** Screens 3, 11, and 12 from
  the UI concepts doc. The side panel here does the job of all of them in one place for now.
- **Photo/attachment upload.** Events can be created with just text fields; the staging
  photo-upload flow (`POST /admin/events/staging/:id/photo`) isn't wired up yet.
- **Icons.** No custom icon set — Chrome will show a generic default in the toolbar.

## Prerequisites

1. `Nonprofit.Mobile.Platform` running locally with a seeded database:
   ```sh
   cd /path/to/Nonprofit.Mobile.Platform
   npm run dev
   ```
   This should give you an API at `http://localhost:3000/api` and an admin dashboard at
   `http://localhost:4200`, seeded with a `loveinc` customer / `newberg` tenant.

   One backend change was made to support this: `api/src/main.ts` now allows
   `chrome-extension://` origins through CORS in dev (extension pages have that kind of
   origin, and the existing allowlist only covered `localhost:*`). If the API was already
   running when you pull that change, restart it.

2. Node 20+ (this repo was scaffolded and built with Node 22).

## Setup

```sh
npm install
npm run build
```

This produces `.output/chrome-mv3/`. In Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `.output/chrome-mv3`

The GrovLink icon should appear in your toolbar.

For live-reload while making changes, use `npm run dev` instead — it watches files and
rebuilds automatically. You'll still need to reload the unpacked extension in
`chrome://extensions` after the first load; `wxt dev` handles reloading for you after that.

## Trying it out

1. Click the toolbar icon on any page — the side panel opens.
2. First time only: sign in with the defaults shown (`affiliate@loveincnewberg.test` /
   `loveinc` / `newberg`), or click **Load users from local DB** to pick a real seeded user.
3. Try the three capture paths:
   - Click the icon with nothing selected → page-level capture.
   - Highlight a sentence on any page → click the bubble that appears above it.
   - Right-click an image → **Send image to GrovLink**.
4. Adjust the title/dates/description if you want, then **Save as draft**.
5. Check `http://localhost:4200` → Events for the tenant you signed in as — the draft
   should be there with `isActive: false`.

## Project layout

```
entrypoints/
  background.ts       service worker: context menus, opens the side panel
  content.ts           selection-bubble content script, runs on every page
  sidepanel/
    App.tsx             dev login + capture form (the bulk of the logic)
    style.css
lib/
  api.ts                fetch wrapper for the local API
  devAuth.ts             chrome.storage-backed dev credentials
  capture.ts             shape of a pending capture + how it's read/cleared
```
