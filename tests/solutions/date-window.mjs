export function dateRange(start, end) {
  const parse = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.slice(0, 4) < "1000")
      throw new RangeError("invalid date");
    const n = Date.parse(`${s}T00:00:00Z`);
    if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== s)
      throw new RangeError("invalid date");
    return n;
  };
  const a = parse(start),
    b = parse(end);
  if (a > b) throw new RangeError("reversed");
  const result = [];
  for (let n = a; n < b; n += 86400000) result.push(new Date(n).toISOString().slice(0, 10));
  return result;
}
