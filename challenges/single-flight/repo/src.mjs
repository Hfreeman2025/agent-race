export function createCache(load) {
  const values = new Map();
  return async function get(key) {
    if (values.has(key)) return values.get(key);
    const value = await load(key);
    values.set(key, value);
    return value;
  };
}
