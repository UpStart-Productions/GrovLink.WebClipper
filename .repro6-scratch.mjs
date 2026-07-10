function isEventType(type) {
  if (typeof type === 'string') return type === 'Event' || type.endsWith('Event');
  if (Array.isArray(type)) return type.some(isEventType);
  return false;
}
function findEventNode(node, depth) {
  if (depth > 4 || node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node;
  if (isEventType(obj['@type'])) return obj;
  if (Array.isArray(obj['@graph'])) return findEventNode(obj['@graph'], depth + 1);
  return null;
}
function extractFromJson(json) {
  const data = JSON.parse(json);
  const event = findEventNode(data, 0);
  if (event && typeof event.startDate === 'string') {
    return { startDate: event.startDate, endDate: typeof event.endDate === 'string' ? event.endDate : undefined };
  }
  return null;
}

const cases = [
  JSON.stringify({ "@context": "https://schema.org", "@type": "Event", name: "Cruise & Brews Car Show", startDate: "2026-07-11T12:00:00-07:00", endDate: "2026-07-11T16:00:00-07:00" }),
  JSON.stringify([{ "@type": "BreadcrumbList" }, { "@type": "Event", startDate: "2026-08-01T09:00:00-07:00" }]),
  JSON.stringify({ "@context": "https://schema.org", "@graph": [ { "@type": "WebPage" }, { "@type": ["Event", "MusicEvent"], startDate: "2026-09-05T18:00:00-07:00", endDate: "2026-09-05T21:00:00-07:00" } ] }),
  JSON.stringify({ "@type": "Organization", name: "Not an event" }),
];

for (const c of cases) {
  console.log(extractFromJson(c));
}
