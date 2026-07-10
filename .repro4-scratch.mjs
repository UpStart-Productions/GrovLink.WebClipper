import * as chrono from 'chrono-node';

const ref = new Date('2026-07-09T20:00:00');

const variants = [
  "Saturday, July 11  •  12 PM - 4 PM",
  "Saturday, July 11  at  12 PM - 4 PM",
  "Saturday, July 11, 12 PM - 4 PM",
];

for (const text of variants) {
  const cleaned = text.replace(/[•|·]/g, ',');
  console.log('=== raw:', JSON.stringify(text));
  console.log('    cleaned:', JSON.stringify(cleaned));
  const results = chrono.parse(cleaned, ref, { forwardDate: true });
  for (const r of results) {
    console.log('  match:', JSON.stringify(r.text), '-> start:', r.start.date().toString(), 'end:', r.end ? r.end.date().toString() : null);
  }
}
