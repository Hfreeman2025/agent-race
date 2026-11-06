import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { expect, it } from "vitest";

it("serves one same-origin font response without Origin-dependent cache variants", async () => {
  await mkdir(".cache", { recursive: true });
  const outDir = await mkdtemp(resolve(".cache/preview-test-"));
  await writeFile(resolve(outDir, "font.woff2"), "header-contract-fixture");
  const server = await preview({
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
    logLevel: "silent",
  });
  try {
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Preview listener missing");
    const url = `http://127.0.0.1:${address.port}/font.woff2`;
    for (const headers of [{}, { Origin: `http://127.0.0.1:${address.port}` }]) {
      const response = await fetch(url, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("font/woff2");
      expect(response.headers.get("vary")).toBeNull();
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(await response.text()).toBe("header-contract-fixture");
    }
  } finally {
    await new Promise<void>((accept, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : accept())),
    );
    await rm(outDir, { recursive: true, force: true });
  }
});
