/** PostgreSQL text columns reject NUL bytes and unpaired UTF-16 surrogates. */

export function stripNullBytes(value: string): string {
  return value.replace(/\0/g, '');
}

/** Remove surrogate code units that aren't part of a valid pair. */
export function stripLoneSurrogates(value: string): string {
  return value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

export function sanitizeTextForDb(value: string): string {
  return stripLoneSurrogates(stripNullBytes(value));
}

export function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const cleaned = sanitizeTextForDb(value).trim();
  return cleaned || undefined;
}

/** Truncate by Unicode code point so we never split an emoji into a lone surrogate. */
export function truncateForDb(text: string, max: number): string {
  const singleLine = sanitizeTextForDb(text).replace(/\s*[\r\n]+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  const codePoints = [...singleLine];
  if (codePoints.length <= max) return singleLine;
  return `${codePoints.slice(0, max - 1).join('').trimEnd()}…`;
}
