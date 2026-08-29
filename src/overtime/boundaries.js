export function normalizeDayBoundary(row) {
  return {
    localDate: row.local_date,
    utcStart: new Date(row.utc_start),
    utcEnd: new Date(row.utc_end),
  };
}
