import { readFile } from "node:fs/promises";

const original = await readFile(new URL("../public/race-history.json", import.meta.url), "utf8");
export async function archiveRace(page, capture) {
  const pattern = "**/race-history.json";
  let release = () => {};
  const barrier = new Promise((resolve) => {
    release = () => resolve();
  });
  await page.route(pattern, async (route) => {
    await barrier;
    await route.fulfill({ status: 200, contentType: "application/json", body: original });
  });
  await page.getByRole("button", { name: "Earlier attempts", exact: true }).click();
  await page.getByRole("heading", { name: "Opening the race archive…" }).waitFor();
  await capture?.();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "How to watch", exact: true }).click();
  const response = page.waitForResponse((url) => url.url().endsWith("/race-history.json"));
  release();
  await (await response).finished();
  await page.waitForTimeout(100);
  const protectedDialog = (await page.locator("#dialog-body").textContent()).includes(
    "Trace a line. Check signed bytes.",
  );
  await page.keyboard.press("Escape");
  await page.unroute(pattern);
  return protectedDialog;
}
