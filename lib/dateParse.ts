import * as chrono from 'chrono-node';

export interface ParsedDateRange {
  start: Date;
  end: Date;
  // Human-readable summary shown next to the Start/End fields so it's obvious
  // why they changed, e.g. "Sat, Jul 12, 2:00 PM – 5:00 PM".
  label: string;
}

// Used whenever a date is found (from structured page data or free-text
// parsing) with a start but no end -- most flyer/announcement copy and even
// some schema.org/Event markup doesn't state a duration, so this is a
// reasonable placeholder rather than leaving the field blank.
export const DEFAULT_DURATION_HOURS = 3;

// Shared by both the structured-data path (App.tsx, when the page has
// schema.org/Event JSON-LD) and the free-text fallback below -- same "what do
// we do when there's no end time" rule either way.
export function withDefaultEnd(start: Date, endIso: string | undefined): { end: Date; hasExplicitEnd: boolean } {
  if (endIso) return { end: new Date(endIso), hasExplicitEnd: true };
  return { end: new Date(start.getTime() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000), hasExplicitEnd: false };
}

// chrono will happily resolve a purely retrospective phrase like "this year"
// or "last month" to a concrete date (Jan 1 of the current year, in the first
// case) even though nobody writing "we're grateful for this year" means
// "January 1st." Those matches have no weekday, month name, explicit date, or
// relative-day word in the matched text -- just a bare "this/last/next
// year/month" -- so they're filtered out below rather than silently feeding a
// wrong date into the form.
const HAS_CONCRETE_DATE_SIGNAL =
  /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*day\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|\b\d{1,2}(st|nd|rd|th)\b|\btomorrow\b|\btonight\b/i;

// Event listing pages (Eventbrite, Facebook, etc.) commonly separate the date
// from the time with a bullet/middot rather than a word chrono recognizes
// ("Saturday, July 11  •  12 PM - 4 PM"). Without this, chrono parses the date
// and the time as two disconnected matches instead of one combined range --
// the date-only match silently defaults to noon with no end time, and the
// time-only match resolves against the *wrong day* since it has nothing to
// anchor it to. Swapping the separator for a comma lets chrono's own grammar
// bridge the two into a single result the way it already handles
// "Saturday, July 11, 12 PM - 4 PM".
function normalizeSeparators(text: string): string {
  return text.replace(/[•·]/g, ',');
}

// Looks for a date/time mention in captured text (e.g. "Join us Saturday,
// July 12 at 2pm for our summer picnic") and turns it into a start/end pair
// for the form. Runs entirely client-side via chrono-node's natural-language
// date grammar -- no AI call, no network round trip, just parsing.
export function parseDateRange(text: string): ParsedDateRange | null {
  if (!text.trim()) return null;

  // forwardDate: true means a bare weekday/month-day mention ("Saturday",
  // "July 12") resolves to the next upcoming occurrence rather than the most
  // recent past one -- what someone clipping an upcoming event almost always
  // means.
  const results = chrono.parse(normalizeSeparators(text), new Date(), { forwardDate: true });

  // Real captured text is rarely just the date -- it's a whole page's worth of
  // copy, and numbers elsewhere in it ("3y hosting", "1st, 2nd, and 3rd place")
  // can parse as bogus low-confidence dates that show up *before* the real one
  // in the text. Walk every match in order and use the first one that actually
  // looks like a real date (see HAS_CONCRETE_DATE_SIGNAL) rather than assuming
  // the first match chrono returns is the right one.
  const result = results.find(
    (r) => HAS_CONCRETE_DATE_SIGNAL.test(r.text) || r.start.isCertain('day'),
  );
  if (!result) return null;

  const start = result.start.date();
  const { end, hasExplicitEnd } = withDefaultEnd(start, result.end?.date().toISOString());

  return { start, end, label: formatDateRangeLabel(start, end, hasExplicitEnd) };
}

// Exported so the structured-data path (App.tsx) can describe its own
// detected range with the same "Sat, Jul 12, 2:00 PM – 5:00 PM" formatting.
export function formatDateRangeLabel(start: Date, end: Date, hasExplicitEnd: boolean): string {
  const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startStr = `${start.toLocaleDateString('en-US', dateFmt)}, ${start.toLocaleTimeString('en-US', timeFmt)}`;
  if (!hasExplicitEnd) {
    return `${startStr} (assumed ${DEFAULT_DURATION_HOURS}h, no end time found)`;
  }
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = sameDay
    ? end.toLocaleTimeString('en-US', timeFmt)
    : `${end.toLocaleDateString('en-US', dateFmt)}, ${end.toLocaleTimeString('en-US', timeFmt)}`;
  return `${startStr} – ${endStr}`;
}

// Same datetime-local string shape the Start/End <input> fields use elsewhere.
export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
