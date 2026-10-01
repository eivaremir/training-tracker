// All "date" strings are local calendar dates (YYYY-MM-DD) so a session logged at 11pm stays on the right day.
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const WEEK_MON = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const weekdayKey = (d: Date) => WEEKDAYS[d.getDay()];

export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
