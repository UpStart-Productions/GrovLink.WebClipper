// The four GrovLink content types the clipper can create. Every admin
// controller for these (admin-events / admin-ctas / admin-classes /
// admin-impact-stories) follows the same shape: {base} for list+create,
// {base}/:id for get+update+delete, {base}/staging/:id/photo for staging a
// photo ahead of create. Keep this file in sync with those controllers if the
// backend's routes ever change.
export type ContentKind = 'event' | 'cta' | 'class' | 'impact_story';

export const CONTENT_KINDS: ContentKind[] = ['event', 'cta', 'class', 'impact_story'];

export const CONTENT_TYPE_LABELS: Record<ContentKind, string> = {
  event: 'Event',
  cta: 'CTA',
  class: 'Class',
  impact_story: 'Impact story',
};

export const CONTENT_BASE_PATH: Record<ContentKind, string> = {
  event: '/admin/events',
  cta: '/admin/ctas',
  class: '/admin/classes',
  impact_story: '/admin/impact-stories',
};

// The list endpoints don't all use the same wrapper key ({ events: [...] } vs
// { impactStories: [...] }, etc.) -- this is what lets fetchDrafts() in api.ts
// read all four with one loop instead of four bespoke calls.
export const CONTENT_LIST_KEY: Record<ContentKind, string> = {
  event: 'events',
  cta: 'ctas',
  class: 'classes',
  impact_story: 'impactStories',
};

// CtaCreateDto.type only accepts these -- see cta-create.dto.ts's CTA_TYPES.
export const CTA_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'donation_drive', label: 'Donation drive' },
  { value: 'volunteer_call', label: 'Volunteer call' },
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'awareness', label: 'Awareness' },
];
