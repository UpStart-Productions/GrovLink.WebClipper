import * as chrono from 'chrono-node';

const ref = new Date('2026-07-09T10:00:00');

const variants = [
  "Saturday, July 11 12pm - 4pm",
  "Saturday, July 11 12pm - 4pm\n",
  "  Saturday, July 11 12pm - 4pm  ",
  "Join us Saturday, July 11 12pm - 4pm for the block party",
  "Saturday, July 11\n12pm - 4pm",
];

for (const text of variants) {
  const results = chrono.parse(text, ref, { forwardDate: true });
  console.log('---', JSON.stringify(text));
  if (!results.length) { console.log('  no match'); continue; }
  const r = results[0];
  console.log('  start:', r.start.date().toString(), 'end:', r.end ? r.end.date().toString() : null);
}
