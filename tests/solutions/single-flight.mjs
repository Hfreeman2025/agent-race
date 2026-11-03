export function createCache(load) {
  const values = new Map();
  return async (key) => {
    if (values.has(key)) return values.get(key);
    const promise = Promise.resolve()
      .then(() => load(key))
      .catch((e) => {
        values.delete(key);
        throw e;
      });
    values.set(key, promise);
    return promise;
  };
}
