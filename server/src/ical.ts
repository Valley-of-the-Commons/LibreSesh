/**
 * Minimal RFC 5545 writer — enough for a read-only schedule feed.
 * All instants are stored UTC, so every timestamp is written with a `Z` suffix
 * and no VTIMEZONE component is needed.
 */

/** Escape the characters RFC 5545 reserves inside a TEXT value. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Content lines are limited to 75 octets, continued by CRLF + one space.
 * Measured in octets, not characters, so multi-byte names fold correctly.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  // The continuation space costs an octet, so later segments get 74.
  for (const char of line) {
    const size = encoder.encode(char).length;
    const budget = out.length === 0 ? 75 : 74;
    if (currentBytes + size > budget) {
      out.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current !== '') out.push(current);
  return out.join('\r\n ');
}

/** 'YYYYMMDDTHHMMSSZ' — the UTC form of a DATE-TIME value. */
export function icsStamp(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

export interface IcsEvent {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  categories?: string[];
  lastModified?: Date;
}

export interface IcsCalendar {
  name: string;
  timezone: string;
  events: IcsEvent[];
  now?: Date;
}

export function buildCalendar(calendar: IcsCalendar): string {
  const stamp = icsStamp(calendar.now ?? new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LibreSesh//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `X-WR-TIMEZONE:${escapeText(calendar.timezone)}`,
  ];

  for (const event of calendar.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsStamp(event.startsAt)}`,
      `DTEND:${icsStamp(event.endsAt)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${escapeText(event.url)}`);
    if (event.categories?.length) {
      lines.push(`CATEGORIES:${event.categories.map(escapeText).join(',')}`);
    }
    if (event.lastModified) lines.push(`LAST-MODIFIED:${icsStamp(event.lastModified)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 requires CRLF line endings and a trailing break.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
