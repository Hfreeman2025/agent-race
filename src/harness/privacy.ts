/** Private denylist values stay in the local environment, never in public source. */
export const privateTerms = (): string[] =>
  (process.env.RACE_PRIVATE_TERMS ?? "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
