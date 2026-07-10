import * as chrono from 'chrono-node';

const WEEKDAY_OR_MONTH = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*day\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|\b\d{1,2}(st|nd|rd|th)\b/i;

const samples = [
  "Join us Saturday, July 12 at 2pm for our summer picnic in the park.",
  "The food drive runs from 9am to 1pm on August 3rd at the community center.",
  "Volunteer orientation is next Tuesday evening.",
  "We are so grateful for everyone who supported our mission this year.",
  "Doors open March 15, 2027 6:30 PM, program starts at 7.",
  "Thanks to donors like you, we served 400 families last month.",
  "This class meets every Monday and Wednesday at noon.",
  "Come celebrate with us tomorrow at 5pm!",
  "We hope to see you there!",
];

for (const text of samples) {
  const results = chrono.parse(text, new Date('2026-07-09T12:00:00'), { forwardDate: true });
  console.log('---', text);
  if (results.length === 0) { console.log('  no match'); continue; }
  const r = results[0];
  const pass = WEEKDAY_OR_MONTH.test(r.text) || r.start.isCertain('day');
  console.log('  matched text:', JSON.stringify(r.text), '-> keep?', pass);
}
