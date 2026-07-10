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
- **Right-click → Send image to GrovLink.** Captures the image URL for flyer-only content,
  and tries to fetch the actual file automatically (see photo notes below).
- **Photo upload.** Uses the real staging flow (`POST {base}/staging/:id/photo`, then
  `stagingId` on create) — same two-step pattern the backend already uses for the admin UI.
  Right-click image captures try to auto-fetch the file; when that's blocked (most
  cross-origin images, since the page has to allow it), or for page/selection captures,
  there's a manual file picker that always works.
- **All four content types.** Event, CTA, Class, and Impact story are all wired to real
  create endpoints (`POST /admin/events`, `/admin/ctas`, `/admin/classes`,
  `/admin/impact-stories`). The Type chips switch which one you're creating; CTA also gets
  its required `type` dropdown (donation drive / volunteer call / fundraiser / awareness).
  Event and CTA show a Start/End date range (required for events, optional for CTAs); Class
  and Impact story skip it since neither's create DTO has one.
- **Approval queue.** A second tab in the panel ("Approve") lists every draft
  (`isActive: false`) across all four types for the signed-in tenant, with one-tap
  Approve (flips `isActive: true`, which also triggers the app notification) or Discard
  (deletes it). This is what makes "Save as draft" a complete loop instead of a dead end.
- **Date detection, two tiers.** Start/End auto-fill instead of sitting at the generic
  +24h default, using whichever of these actually has data:
  1. **Structured page data.** Most event platforms (Eventbrite, Facebook Events, Meetup,
     WordPress/Squarespace event plugins) embed exact ISO dates as schema.org/Event
     JSON-LD for SEO. The content script reads this directly when present — no parsing,
     no ambiguity, works for any capture kind (selection, image, or page) since it's a
     property of the page, not what you clicked on.
  2. **Free-text parsing.** Falls back to `chrono-node` (a plain natural-language date
     parser, no AI call, runs locally) on the captured text when a page has no structured
     data. Tries every date-like match chrono finds and keeps the first one that actually
     looks like a real date, since real page text often has noise ("3y hosting", ordinal
     placement numbers) that parses as bogus low-confidence dates ahead of the real one.
     Also normalizes bullet/middot separators ("Saturday, July 11 • 12 PM") since chrono
     doesn't otherwise connect the date and time into one range.

  Either way, a helper note under the fields says what was detected and where it came
  from; editing either field clears the note.
- **Dev login.** A stand-in for real auth (see "What's deliberately left out" below).
- **Real write paths.** Saving submits a genuine create call to your local API, landing as
  a draft (`isActive: false`) in whatever tenant you signed in as.

## What's deliberately left out (for now)

- **Real login.** This stub signs in with your API's *dev* auth headers
  (`x-user-email` / `x-customer-slug` / `x-tenant-slug`), not Cognito. Those headers only
  work when the API's `NODE_ENV !== 'production'` — see
  `api/src/app/auth/dev-auth.guard.ts` in `Nonprofit.Mobile.Platform`. Real Cognito login
  (direct, no backend auth endpoint needed, ~365-day session) is the next piece to build.
- **Toolbar quick-capture popup, settings page.** Screens 3 and 12 from the UI concepts
  doc. The side panel here does the job of both in one place for now.
- **Attachments (PDFs etc.).** Only the single photo per item is wired up, not the separate
  attachments staging endpoint each content type also has.
- **Class scheduling and CTA relations.** Classes can be created and approved, but without a
  schedule rule (no sessions) — add that from the main admin UI for now. Same for CTA's
  optional links to a service/donation/class/event/volunteer position.

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

1. Click the toolbar icon on any page — the side panel opens on the **Capture** tab.
2. First time only: sign in with the defaults shown (`affiliate@loveincnewberg.test` /
   `loveinc` / `newberg`), or click **Load users from local DB** to pick a real seeded user.
3. Try the three capture paths — these merge into the same draft rather than replacing
   each other, so you can combine a text selection with a photo:
   - Click the icon with nothing selected → page-level capture.
   - Highlight a sentence on any page → click the bubble that appears above it.
   - Right-click an image → **Send image to GrovLink**.
4. Pick a Type (Event / CTA / Class / Impact story), adjust the fields, then
   **Save as draft**.
5. Switch to the **Approve** tab to see it in the queue, then **Approve** (goes live,
   `isActive: true`) or **Discard** (deletes it).
6. Check `http://localhost:4200` for the tenant you signed in as — the item should show
   up under whichever section matches the Type you picked.

## Project layout

```
entrypoints/
  background.ts       service worker: context menus, opens the side panel
  content.ts           selection-bubble content script, runs on every page
  sidepanel/
    App.tsx             dev login + capture form + approval queue (the bulk of the logic)
    style.css
lib/
  api.ts                fetch wrapper for the local API (create/staging/list/approve/discard)
  contentTypes.ts        shared shape of the four content kinds (event/cta/class/impact_story)
  dateParse.ts           chrono-node wrapper: text -> Start/End, filters out vague matches
                         (structured schema.org/Event JSON-LD is read in content.ts instead --
                         see extractEventSchema() there)
  devAuth.ts             chrome.storage-backed dev credentials
  capture.ts             shape of a pending capture + how it's read/cleared
```
