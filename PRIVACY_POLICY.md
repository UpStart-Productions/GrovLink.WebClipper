# GrovLink Web Clipper — Privacy Policy

_Last updated: [DATE]_

GrovLink Web Clipper ("the extension") is a Chrome browser extension built for
staff and affiliates of nonprofit organizations using the GrovLink platform.
This policy explains what data the extension accesses, what it sends to
GrovLink's servers, and what stays only on your device.

## Who this extension is for

The extension is intended for use by authorized staff and affiliates of
organizations with a GrovLink account. It is not intended for use by the
general public and is not directed at children.

## Data the extension collects

**Authentication information.** When you sign in, the extension stores your
GrovLink/Cognito login session (an authentication token and a refresh token)
in your browser's local extension storage. This keeps you signed in between
uses. This token is sent to GrovLink's API (`api.grovlink.com`) with each
request you make through the extension, and to GrovLink's authentication
provider, AWS Cognito (`auth.grovlink.com`), to complete sign-in and refresh
your session. We do not see or store your password — sign-in is handled
entirely by Cognito's own login page (email/password or "Sign in with
Google").

**Website content you choose to capture.** The extension's core function is
letting you select text or right-click an image on a webpage and send it to
GrovLink as a draft event, call to action, class, or impact story. Only
content you explicitly select and choose to save is sent to GrovLink's API.
It becomes part of your organization's GrovLink data, reviewed and approved
the same way any other content in GrovLink is.

## Data the extension does not collect

- The extension does not track or transmit your general browsing history.
  It reads the title and URL of a page only at the moment you actively use
  the extension on that page (e.g., clicking the toolbar icon or the
  right-click menu), to show you what you're capturing from. This
  information is not sent to GrovLink's servers and is discarded once your
  capture is saved or the browser session ends.
- The extension does not collect health, financial, or payment information.
- The extension does not read your email, messages, or other personal
  communications.
- The extension does not collect your location.
- The extension does not track clicks, scrolling, keystrokes, or other
  activity outside of the specific actions you take within the extension.

## Data stored only on your device

The extension keeps a few pieces of information in your browser's local
storage that never leave your device:

- Which organization/location you're currently working in (if you have
  access to more than one).
- A private, per-device list of which notifications you've already opened,
  used only to visually fade items you've seen — this is never sent to
  GrovLink's servers and does not affect what other staff see.

## How your data is used

Data collected through the extension is used solely to operate GrovLink for
your organization: authenticating you, letting you submit draft content, and
showing you relevant notifications. We do not sell your data, use it for
advertising, or share it with third parties other than the infrastructure
providers necessary to run GrovLink (currently Amazon Web Services, which
hosts GrovLink's API and authentication).

## Data retention and deletion

Authentication tokens are removed from your device when you sign out.
Content you submit through the extension is retained as part of your
organization's GrovLink account, governed by the same retention practices as
content created directly in the GrovLink admin dashboard. To request deletion
of content or account data, contact [PRIVACY CONTACT EMAIL].

## Security

Data in transit between the extension and GrovLink's servers is encrypted
(HTTPS). Authentication tokens are scoped to your GrovLink account and
organization and are not accessible to other extensions or websites.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised. Material
changes will be communicated to GrovLink administrators.

## Contact

Questions about this policy or your data can be sent to
[PRIVACY CONTACT EMAIL].
