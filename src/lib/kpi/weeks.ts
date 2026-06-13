import { addDays, getQuarterBounds, parseDateKey, toDateKey, type Quarter } from "@/lib/kpi/dates";

export type IsoWeek = {
  key: string;
  week: number;
  year: number;
  startDate: string;
  endDate: string;
  label: string;
};

export function listQuarterWeeks(year: number, quarter: Quarter): IsoWeek[] {
  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const quarterStart = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  let cursor = startOfIsoWeek(quarterStart);
  const weeks: IsoWeek[] = [];

  while (cursor <= end) {
    const weekYear = getIsoWeekYear(cursor);
    const week = getIsoWeek(cursor);
    const rawWeekEnd = addDays(cursor, 6);
    const clampedStart = cursor < quarterStart ? quarterStart : cursor;
    const clampedEnd = rawWeekEnd > end ? end : rawWeekEnd;
    const weekStart = toDateKey(clampedStart);
    const weekEnd = toDateKey(clampedEnd);

    weeks.push({
      endDate: weekEnd,
      key: `${weekYear}-W${String(week).padStart(2, "0")}`,
      label: `KW ${week} · ${formatShortDate(weekStart)}-${formatShortDate(weekEnd)}`,
      startDate: weekStart,
      week,
      year: weekYear
    });

    cursor = addDays(cursor, 7);
  }

  return weeks;
}

export function getIsoWeek(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));

  return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getIsoWeekYear(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);

  return copy.getUTCFullYear();
}

export function startOfIsoWeek(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);

  return copy;
}

export function formatShortDate(dateKey: string) {
  const [, month, day] = dateKey.split("-");

  return `${day}.${month}.`;
}
