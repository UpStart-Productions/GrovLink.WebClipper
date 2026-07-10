import * as chrono from 'chrono-node';

const samples = [
  "Join us Saturday, July 12 at 2pm for our summer picnic in the park.",
  "The food drive runs from 9am to 1pm on August 3rd at the community center.",
  "Volunteer orientation is next Tuesday evening.",
  "We are so grateful for everyone who supported our mission this year.",
  "Doors open March 15, 2027 6:30 PM, program starts at 7.",
];

for (const text of samples) {
  const results = chrono.parse(text, new Date('2026-07-09T12:00:00'), { forwardDate: true });
  console.log('---');
  console.log(text);
  if (results.length === 0) {
    console.log('  -> no match');
  } else {
    const r = results[0];
    console.log('  start:', r.start.date().toString());
    console.log('  end:', r.end ? r.end.date().toString() : '(none)');
  }
}
