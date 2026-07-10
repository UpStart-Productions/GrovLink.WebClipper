import * as chrono from 'chrono-node';

const text = "Cruise & Brews Car Show by Chehalem Valley Brewing 40 followers 34 events 3y hosting 760 total attendees Follow Chehalem Valley Brewing Co.Newberg, OR Saturday, July 11  •  12 PM - 4 PM Overview Roll in, check out cool rides, and sip brews at the ultimate first annual Cruise & Brews Car Show – good vibes guaranteed! Cruise & Brews Car Show Get ready to roll in style at the Cruise & Brews Car Show! This is the perfect spot to check out some awesome rides, sip on your favorite brews, hang out with fellow car lovers, all while supporting local nonprofit, Hayden Fredrickson Scholarship*. As our first annual Cruise & Brews Car Show - we are including ALL types of cars. So if you consider your car exotic, classic, hot rod, etc., bring it in! The public will vote on their favorite ride and awards will be given to 1st, 2nd, and 3rd place. Locally hand crafted trophy's and a CVB gift card will be awarded for each winner! To register your car, purchase your ticket here on eventbrite! Enjoy the live music band, local vendors, tasty pub food and refreshing beer during an afternoon of cool cars and good times. Don’t miss out on the fun and friendly atmosphere—see you there! The Hayden Fredrickson Scholarship in a local nonprofit that supports the students at Newberg High School by providing scholarships to the boys and girls soccer teams each year. Hayden is a former NHS student who's legacy has carried through a huge part of the Newberg community. We strive to keep his legacy alive and make a difference to other students like he would have wanted to.";

const ref = new Date('2026-07-09T20:00:00');
const results = chrono.parse(text, ref, { forwardDate: true });
console.log('total matches:', results.length);
for (const r of results) {
  console.log('---');
  console.log('index:', r.index, 'text:', JSON.stringify(r.text));
  console.log('start:', r.start.date().toString());
  console.log('end:', r.end ? r.end.date().toString() : null);
  console.log('certain day:', r.start.isCertain('day'));
}
