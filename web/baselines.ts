import date from "../challenges/date-window/repo/src.mjs?raw";
import single from "../challenges/single-flight/repo/src.mjs?raw";
import unicode from "../challenges/unicode-slug/repo/src.mjs?raw";
export const baselines: Record<string, Record<string, string>> = {
  "single-flight": { "src.mjs": single },
  "unicode-slug": { "src.mjs": unicode },
  "date-window": { "src.mjs": date },
};
