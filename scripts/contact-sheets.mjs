import { readdir, readFile } from "node:fs/promises";
import * as pw from "playwright";
import { silentBrowser } from "./silent.mjs";

const pass = process.argv[2] ?? "pass1";
const dir = `${process.env.RACE_SHOT_ROOT ?? ".cache/browser/v2"}/${pass}`;
const browser = await silentBrowser(pw, "chromium");
try {
  for (const size of ["desktop", "mobile"]) {
    const files = (await readdir(dir))
      .filter((f) => f.startsWith(`chromium-${size}-`) && f.endsWith(".png"))
      .sort();
    const chunk = size === "desktop" ? 6 : 3;
    for (let n = 0; n < files.length; n += chunk) {
      const cards = await Promise.all(
        files
          .slice(n, n + chunk)
          .map(
            async (f) =>
              `<div><p>${f}</p><img src="data:image/png;base64,${(await readFile(`${dir}/${f}`)).toString("base64")}"></div>`,
          ),
      );
      const page = await browser.newPage({
        viewport: {
          width: size === "desktop" ? 1440 : 1170,
          height: size === "desktop" ? 660 : 880,
        },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<html><style>*{box-sizing:border-box}body{margin:0;background:#ddd;font:12px Arial;display:grid;grid-template-columns:repeat(3,1fr)}p{height:30px;margin:0;padding:8px}img{width:100%;display:block}</style><body>${cards.join("")}</body></html>`,
      );
      await page.screenshot({ path: `${dir}/contact-${size}-${Math.floor(n / chunk) + 1}.png` });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
