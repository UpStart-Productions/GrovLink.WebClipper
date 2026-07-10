import * as chrono from 'chrono-node';

const HAS_CONCRETE_DATE_SIGNAL =
  /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*day\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|\b\d{1,2}(st|nd|rd|th)\b|\btomorrow\b|\btonight\b/i;
const DEFAULT_DURATION_HOURS = 3;

function normalizeSeparators(text) {
  return text.replace(/[•·]/g, ',');
}

function parseDateRange(text, ref) {
  if (!text.trim()) return null;
  const results = chrono.parse(normalizeSeparators(text), ref, { forwardDate: true });
  const result = results.find((r) => HAS_CONCRETE_DATE_SIGNAL.test(r.text) || r.start.isCertain('day'));
  if (!result) return null;
  const start = result.start.date();
  const hasExplicitEnd = result.end != null;
  const end = result.end ? result.end.date() : new Date(start.getTime() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000);
  return { start, end };
}

const text = "Cruise & Brews Car Show by Chehalem Valley Brewing 40 followers 34 events 3y hosting 760 total attendees Follow Chehalem Valley Brewing Co.Newberg, OR Saturday, July 11  •  12 PM - 4 PM Overview Roll in, check out cool rides, and sip brews at the ultimate first annual Cruise & Brews Car Show – good vibes guaranteed! Cruise & Brews Car Show Get ready to roll in style at the Cruise & Brews Car Show! This is the perfect spot to check out some awesome rides, sip on your favorite brews, hang out with fellow car lovers, all while supporting local nonprofit, Hayden Fredrickson Scholarship*. As our first annual Cruise & Brews Car Show - we are including ALL types of cars. So if you consider your car exotic, classic, hot rod, etc., bring it in! The public will vote on their favorite ride and awards will be given to 1st, 2nd, and 3rd place. Locally hand crafted trophy's and a CVB gift card will be awarded for each winner!";

const ref = new Date('2026-07-09T20:00:00');
const parsed = parseDateRange(text, ref);
console.log('start:', parsed.start.toString());
console.log('end:', parsed.end.toString());
