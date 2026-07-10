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
- **Notification bell.** Shows the same staff-facing operational alerts the admin
  dashboard does (class registrations, volunteer interest, voucher requests, intake
  submissions, etc. — see `AdminNotificationsController`), with an unread-count badge.
  Read-only against the backend by design: the extension never calls the mark-read/unread
  or approve/deny endpoints — those are real, shared processing actions that belong in the
  admin dashboard, where everyone on staff sees the same state. Each notification has an
  "open in app" icon (deep-linked the same way the admin dashboard's own bell links, via
  `notificationLinkPath()` in `lib/api.ts`) that opens the right admin page in a new tab and
  remembers, in this browser only (`lib/notificationViews.ts`), that this person looked at
  it — fading and sinking it locally without touching the shared `readAt`.
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
- **Real Cognito login.** "Sign in with GrovLink" opens the same Hosted UI the admin
  dashboard uses (password or "Continue with Google") via
  `chrome.identity.launchWebAuthFlow`, using OAuth Authorization Code + PKCE against
  Cognito's token endpoint directly — no AWS Amplify, no backend auth endpoint. Reuses
  the admin app's existing App Client (`4qvqllf1hegq189djtbj04vn2b`), so it's the same
  user pool and the same signed-in users. After login, a picker walks `GET
  /my-customers` → `GET /my-tenants` to choose which org to act as (auto-skipping any
  step with only one option). See `lib/cognitoAuth.ts` and `lib/orgContext.ts`.
- **Dev login.** Still available behind "Use local dev login instead" on the sign-in
  screen, for local testing without a real account (see below).
- **Real write paths.** Saving submits a genuine create call to your local API, landing as
  a draft (`isActive: false`) in whatever tenant you signed in as.

## What's deliberately left out (for now)

- **Dev login only works locally.** The "Use local dev login instead" path sends your
  API's *dev* auth headers (`x-user-email` / `x-customer-slug` / `x-tenant-slug`) instead
  of a token, and only works when the API's `NODE_ENV !== 'production'` — see
  `api/src/app/auth/dev-auth.guard.ts` in `Nonprofit.Mobile.Platform`. Cognito login works
  against the local API too (`AppAuthGuard` checks for a Bearer token regardless of
  `NODE_ENV`), so there's no need to use dev login unless you want to skip real auth
  entirely.
- **One AWS-side registration still needed.** The extension's OAuth redirect URI
  (`https://cdoajlipibgcaelkcfljfakanlclogpj.chromiumapp.org/`) needs to be added to the
  Cognito App Client's allowed callback URLs *and* allowed sign-out URLs before
  "Sign in with GrovLink" will work — see `dev-keys/README.md`.
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
  api.ts                fetch wrapper for the local API (create/staging/list/approve/discard,
                        plus my-customers/my-tenants for the org picker)
  contentTypes.ts        shared shape of the four content kinds (event/cta/class/impact_story)
  dateParse.ts           chrono-node wrapper: text -> Start/End, filters out vague matches
                         (structured schema.org/Event JSON-LD is read in content.ts instead --
                         see extractEventSchema() there)
  cognitoAuth.ts          real Cognito Hosted UI login (launchWebAuthFlow + PKCE), token
                         storage/refresh
  orgContext.ts           which customer/tenant a Cognito-signed-in user picked
  notificationViews.ts    local-only (per-browser) "I've looked at this notification"
                         tracking -- never synced to the backend's readAt
  devAuth.ts             chrome.storage-backed dev credentials
  capture.ts             shape of a pending capture + how it's read/cleared
dev-keys/
  extension-dev-key.pem  pinned keypair for a stable extension ID (gitignored) -- see
                        dev-keys/README.md for why, and the AWS callback URL to register
```
