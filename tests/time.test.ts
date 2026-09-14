import { describe, it, expect } from 'vitest';
import { splitDays, sliceEntry, weekKey, clock, csvCell, overlaps, freeSlot, decimalHoursToSeconds } from '../src/lib/time';
import { resolveRate } from '../src/lib/demo';
import type { Entry } from '../src/lib/types';
const entry = (a: string, b: string): Entry => ({
  id: 'one',
  user_id: 'u',
  description: '',
  project_id: null,
  task_id: null,
  tag_ids: [],
  billable: true,
  start_at: a,
  end_at: b,
});
describe('time boundaries and billing', () => {
  it('converts decimal sheet hours to seconds', () => expect(decimalHoursToSeconds(1.5)).toBe(5400));
  it('splits at Panama midnight without losing time', () => {
    const e = entry('2026-09-07T04:30:00Z', '2026-09-07T05:30:00Z');
    expect(splitDays(e, 'America/Panama')).toEqual([
      { day: '2026-09-06', seconds: 1800 },
      { day: '2026-09-07', seconds: 1800 },
    ]);
    expect(sliceEntry(e, '2026-09-07', '2026-09-13', 'America/Panama')).toBe(1800);
  });
  it('handles a 23-hour daylight saving day', () => {
    const e = entry('2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z');
    expect(splitDays(e, 'America/New_York')).toEqual([{ day: '2026-03-08', seconds: 82800 }]);
  });
  it('does not create an extra day at exact midnight', () =>
    expect(splitDays(entry('2026-09-06T23:00:00Z', '2026-09-07T00:00:00Z'), 'UTC')).toEqual([
      { day: '2026-09-06', seconds: 3600 },
    ]));
  it('uses Monday for weeks across the year', () => expect(weekKey('2027-01-01')).toBe('2026-12-28'));
  it('formats durations longer than one day', () => expect(clock(90061)).toBe('25:01:01'));
  it('detects overlap but not adjacent records', () => {
    const e = entry('2026-01-01T10:00Z', '2026-01-01T11:00Z');
    expect(overlaps(e, { ...e, id: 'two', start_at: '2026-01-01T10:30Z' })).toBe(true);
    expect(overlaps(e, { ...e, id: 'two', start_at: '2026-01-01T11:00Z', end_at: '2026-01-01T12:00Z' })).toBe(
      false,
    );
  });
  it('finds the first free daily slot for manual hours', () => {
    const existing = entry('2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z');
    const slot = freeSlot('2026-01-01', 2 * 3600, [existing], 'UTC');
    expect(slot).toEqual({ start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T02:00:00.000Z' });
  });
  it('protects CSV text cells against formula injection', () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell('one, two')).toBe('"one, two"');
  });
  it('resolves all four rate levels in order', () => {
    const rates = [
      { id: '1', user_id: null, project_id: null, amount: 10 },
      { id: '2', user_id: 'u', project_id: null, amount: 20 },
      { id: '3', user_id: null, project_id: 'p', amount: 30 },
      { id: '4', user_id: 'u', project_id: 'p', amount: 40 },
    ];
    expect(resolveRate(rates, 'u', 'p')).toBe(40);
    expect(resolveRate(rates, 'v', 'p')).toBe(30);
    expect(resolveRate(rates, 'u', 'q')).toBe(20);
    expect(resolveRate(rates, 'v', 'q')).toBe(10);
  });
});
