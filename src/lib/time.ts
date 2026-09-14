import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { Entry } from './types';
export const dayKey = (date: Date | string, zone = 'America/Panama') =>
  formatInTimeZone(date, zone, 'yyyy-MM-dd');
export const shiftDay = (day: string, amount: number) => format(addDays(parseISO(day), amount), 'yyyy-MM-dd');
export const weekKey = (day: string) => format(startOfWeek(parseISO(day), { weekStartsOn: 1 }), 'yyyy-MM-dd');
export const localISO = (value: string, zone: string) => fromZonedTime(value, zone).toISOString();
export const inputDate = (value: string, zone: string) => formatInTimeZone(value, zone, "yyyy-MM-dd'T'HH:mm");
export const duration = (entry: Entry, now = Date.now()) =>
  Math.max(0, ((entry.end_at ? Date.parse(entry.end_at) : now) - Date.parse(entry.start_at)) / 1000);
export function clock(seconds: number, withSeconds = true) {
  const s = Math.floor(Math.max(0, seconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, ...(withSeconds ? [s % 60] : [])]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
export function hours(seconds: number) {
  const s = Math.floor(Math.max(0, seconds));
  return `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')} min`;
}
export const decimalHoursToSeconds = (value: number) => Math.round(Math.max(0, value) * 3600);
export const money = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('es-PA', { style: 'currency', currency }).format(amount);
export function sliceEntry(entry: Entry, from: string, to: string, zone: string, now = Date.now()) {
  const a = Date.parse(entry.start_at),
    b = entry.end_at ? Date.parse(entry.end_at) : now;
  const lo = fromZonedTime(from + 'T00:00:00', zone).getTime(),
    hi = fromZonedTime(shiftDay(to, 1) + 'T00:00:00', zone).getTime();
  return Math.max(0, Math.min(b, hi) - Math.max(a, lo)) / 1000;
}
export function splitDays(entry: Entry, zone: string, now = Date.now()) {
  const end = entry.end_at ? Date.parse(entry.end_at) : now;
  if (end <= Date.parse(entry.start_at)) return [];
  const out: { day: string; seconds: number }[] = [];
  const last = dayKey(new Date(end - 1), zone);
  for (let d = dayKey(entry.start_at, zone); d <= last; d = shiftDay(d, 1))
    out.push({ day: d, seconds: sliceEntry(entry, d, d, zone, now) });
  return out;
}
export const overlaps = (a: Entry, b: Entry) =>
  a.id !== b.id &&
  a.user_id === b.user_id &&
  Date.parse(a.start_at) < (b.end_at ? Date.parse(b.end_at) : Infinity) &&
  Date.parse(b.start_at) < (a.end_at ? Date.parse(a.end_at) : Infinity);
/** Finds the first free interval on a local calendar day for a manual duration. */
export function freeSlot(day: string, seconds: number, entries: Entry[], zone: string, excludeId?: string) {
  const dayStart = fromZonedTime(day + 'T00:00:00', zone).getTime();
  const dayEnd = fromZonedTime(shiftDay(day, 1) + 'T00:00:00', zone).getTime();
  const blocks = entries
    .filter((e) => e.id !== excludeId && e.user_id && e.end_at)
    .map((e) => ({
      start: Math.max(dayStart, Date.parse(e.start_at)),
      end: Math.min(dayEnd, Date.parse(e.end_at!)),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let cursor = dayStart;
  for (const block of blocks) {
    if (block.start - cursor >= seconds * 1000) return { start: new Date(cursor).toISOString(), end: new Date(cursor + seconds * 1000).toISOString() };
    cursor = Math.max(cursor, block.end);
  }
  return cursor + seconds * 1000 <= dayEnd
    ? { start: new Date(cursor).toISOString(), end: new Date(cursor + seconds * 1000).toISOString() }
    : null;
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
