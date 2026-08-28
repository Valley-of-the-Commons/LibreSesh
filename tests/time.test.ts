import { describe, expect, it } from 'vitest';
import {
  dateRange,
  durationMinutes,
  isValidTimezone,
  localDate,
  localMinuteOfDay,
  zonedTimeToUtc,
} from '../server/src/shared/time.js';

const BERLIN = 'Europe/Berlin';
const KATHMANDU = 'Asia/Kathmandu'; // UTC+05:45 — a non-hour offset

describe('timezone helpers', () => {
  it('validates IANA names', () => {
    expect(isValidTimezone(BERLIN)).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });

  it('round-trips a wall-clock time through UTC', () => {
    const instant = zonedTimeToUtc('2026-06-01', 10 * 60, BERLIN);
    expect(instant.toISOString()).toBe('2026-06-01T08:00:00.000Z'); // CEST = UTC+2
    expect(localDate(instant, BERLIN)).toBe('2026-06-01');
    expect(localMinuteOfDay(instant, BERLIN)).toBe(600);
  });

  it('handles winter time on the same zone', () => {
    const instant = zonedTimeToUtc('2026-01-15', 10 * 60, BERLIN);
    expect(instant.toISOString()).toBe('2026-01-15T09:00:00.000Z'); // CET = UTC+1
  });

  it('handles a 45-minute offset', () => {
    const instant = zonedTimeToUtc('2026-06-01', 10 * 60, KATHMANDU);
    expect(instant.toISOString()).toBe('2026-06-01T04:15:00.000Z');
    expect(localMinuteOfDay(instant, KATHMANDU)).toBe(600);
    // The instant is on a 5-minute step locally but not in UTC minutes-of-hour.
    expect(localMinuteOfDay(instant, KATHMANDU) % 5).toBe(0);
  });

  it('survives the spring-forward gap', () => {
    // 02:00–03:00 does not exist on 2026-03-29 in Berlin.
    const instant = zonedTimeToUtc('2026-03-29', 2 * 60 + 30, BERLIN);
    expect(localDate(instant, BERLIN)).toBe('2026-03-29');
    expect(Number.isNaN(instant.getTime())).toBe(false);
  });

  it('resolves the ambiguous autumn hour to one real instant', () => {
    const instant = zonedTimeToUtc('2026-10-25', 2 * 60 + 30, BERLIN);
    expect(localMinuteOfDay(instant, BERLIN)).toBe(150);
  });

  it('reports local midnight as minute 0, not 1440', () => {
    const instant = zonedTimeToUtc('2026-06-02', 0, BERLIN);
    expect(localMinuteOfDay(instant, BERLIN)).toBe(0);
    expect(localDate(instant, BERLIN)).toBe('2026-06-02');
  });

  it('lists an inclusive date range', () => {
    expect(dateRange('2026-06-01', '2026-06-03')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
    expect(dateRange('2026-06-01', '2026-06-01')).toEqual(['2026-06-01']);
  });

  it('crosses a month boundary', () => {
    expect(dateRange('2026-05-31', '2026-06-01')).toEqual(['2026-05-31', '2026-06-01']);
  });

  it('measures whole minutes', () => {
    expect(
      durationMinutes(new Date('2026-06-01T10:00:00Z'), new Date('2026-06-01T11:30:00Z')),
    ).toBe(90);
  });
});
