import * as chrono from 'chrono-node';

const text = "Saturday, July 11 12pm - 4pm";
const ref = new Date('2026-07-09T10:00:00');
console.log('ref:', ref.toString());

const results = chrono.parse(text, ref, { forwardDate: true });
for (const r of results) {
  console.log('---');
  console.log('matched text:', JSON.stringify(r.text));
  console.log('start certain day:', r.start.isCertain('day'), 'weekday:', r.start.get('weekday'), 'day:', r.start.get('day'), 'month:', r.start.get('month'));
  console.log('start date:', r.start.date().toString());
  console.log('end:', r.end ? r.end.date().toString() : null);
}
