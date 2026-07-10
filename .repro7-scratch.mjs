function toSingleLine(text) {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function textToHtml(text) {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');
}

const text = "Cruise & Brews Car Show by Chehalem Valley Brewing\n40 followers\n34 events\n3y hosting\n760 total attendees\nFollow Chehalem Valley Brewing Co.\nNewberg, OR\nSaturday, July 11  •  12 PM - 4 PM\nOverview\nRoll in, check out cool rides, and sip brews at the ultimate first annual Cruise & Brews Car Show – good vibes guaranteed!";

console.log('SINGLE LINE:', toSingleLine(text));
console.log('---');
console.log('HTML:', textToHtml(text));
