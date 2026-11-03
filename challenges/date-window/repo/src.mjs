export function dateRange(start, end) {
  const days = [];
  const cursor = new Date(start);
  const stop = new Date(end);
  while (cursor <= stop) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
