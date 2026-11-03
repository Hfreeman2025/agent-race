import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { silentBrowser } from "./silent.mjs";

const require = createRequire("<local path>");
const pw = require("playwright");
const displayFont = await readFile("public/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2");
const browser = await silentBrowser(pw, "chromium");
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await page.goto("http://127.0.0.1:4317");
  await page.waitForSelector("[data-node]");
  await page.waitForSelector("[data-node]");
  await page.evaluate(() => document.fonts.ready);
  const clip = await page.locator("#flight").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const last = el.querySelector(".trace-call").getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: last.bottom - r.top };
  });
  const source = await page.screenshot({ clip });
  await writeFile("shots/plex/social-source.png", source);
  const social = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await social.setContent(
    `<html><style>@font-face{font-family:'IBM Plex Sans Condensed';font-weight:600;src:url(data:font/woff2;base64,${displayFont.toString("base64")}) format('woff2')}*{box-sizing:border-box}body{margin:0;background:#111410;color:#e4ff4f;padding:12px 40px;font-family:'IBM Plex Sans Condensed','Arial Narrow',sans-serif;font-weight:600}header{height:40px;display:flex;align-items:center;justify-content:space-between;font-size:28px;letter-spacing:.4px}header span{font:500 11px "IBM Plex Sans Condensed";color:#b1baaa;letter-spacing:1px}img{display:block;width:1120px;height:auto}</style><body><header>AGENT RACE<span>FLIGHT RECORDER / INFERRED FLOW</span></header><img src="data:image/png;base64,${source.toString("base64")}" alt="Real recorded tool calls and inferred information flow"></body></html>`,
  );
  await social.evaluate(() => document.fonts.ready);
  await social.screenshot({ path: "public/og.png" });
  console.log("public/og.png: 1200×630, from the real rendered Flight recorder.");
} finally {
  await browser.close();
}
