const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS DD.MM.YYYY in the given time zone mode. */
export function formatDateTime(value: Date | string | number, utc = false): string {
  const d = new Date(value);
  const [h, m, s, day, month, year] = utc
    ? [
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        d.getUTCDate(),
        d.getUTCMonth() + 1,
        d.getUTCFullYear(),
      ]
    : [d.getHours(), d.getMinutes(), d.getSeconds(), d.getDate(), d.getMonth() + 1, d.getFullYear()];
  return `${pad(h)}:${pad(m)}:${pad(s)} ${pad(day)}.${pad(month)}.${year}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
