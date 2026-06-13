export type Quarter = 1 | 2 | 3 | 4;

export type SpecialDayInput = {
  date: string;
};

export type WorkdaySummary = {
  year: number;
  quarter: Quarter;
  startDate: string;
  endDate: string;
  totalWorkdays: number;
  elapsedWorkdays: number;
  remainingWorkdays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function getCurrentQuarter(date = new Date()): { year: number; quarter: Quarter } {
  return {
    year: date.getFullYear(),
    quarter: (Math.floor(date.getMonth() / 3) + 1) as Quarter
  };
}

export function getQuarterBounds(year: number, quarter: Quarter) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end)
  };
}

export function listQuarterDates(year: number, quarter: Quarter) {
  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const dates: string[] = [];
  let cursor = parseDateKey(startDate);
  const end = parseDateKey(endDate);

  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function getSchleswigHolsteinHolidayKeys(year: number) {
  const easter = getEasterSunday(year);
  const fixed = [
    `${year}-01-01`,
    `${year}-05-01`,
    `${year}-10-03`,
    `${year}-10-31`,
    `${year}-12-25`,
    `${year}-12-26`
  ];

  return new Set([
    ...fixed,
    toDateKey(addDays(easter, -2)),
    toDateKey(addDays(easter, 1)),
    toDateKey(addDays(easter, 39)),
    toDateKey(addDays(easter, 50))
  ]);
}

export function isDefaultWorkday(dateKey: string, holidayKeys: Set<string>) {
  const date = parseDateKey(dateKey);
  const day = date.getUTCDay();
  const isSunday = day === 0;

  return !isSunday && !holidayKeys.has(dateKey);
}

export function isWorkday(
  dateKey: string,
  holidayKeys: Set<string>,
  specialOpeningKeys = new Set<string>(),
  specialClosingKeys = new Set<string>()
) {
  if (specialClosingKeys.has(dateKey)) {
    return false;
  }

  if (specialOpeningKeys.has(dateKey)) {
    return true;
  }

  return isDefaultWorkday(dateKey, holidayKeys);
}

export function summarizeQuarterWorkdays({
  year,
  quarter,
  today = toDateKey(new Date()),
  specialOpenings = [],
  specialClosings = []
}: {
  year: number;
  quarter: Quarter;
  today?: string;
  specialOpenings?: SpecialDayInput[];
  specialClosings?: SpecialDayInput[];
}): WorkdaySummary {
  const dates = listQuarterDates(year, quarter);
  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const holidayKeys = getSchleswigHolsteinHolidayKeys(year);
  const openingKeys = new Set(specialOpenings.map((day) => day.date));
  const closingKeys = new Set(specialClosings.map((day) => day.date));
  const workdays = dates.filter((dateKey) =>
    isWorkday(dateKey, holidayKeys, openingKeys, closingKeys)
  );
  const elapsedWorkdays = workdays.filter((dateKey) => dateKey <= today).length;
  const remainingWorkdays = workdays.filter((dateKey) => dateKey > today).length;

  return {
    year,
    quarter,
    startDate,
    endDate,
    totalWorkdays: workdays.length,
    elapsedWorkdays,
    remainingWorkdays
  };
}

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}
