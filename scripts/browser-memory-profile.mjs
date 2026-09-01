#!/usr/bin/env node
if (!process.env.E2E_BASE_URL || !process.env.E2E_EDITOR_PATH) { console.error("[BLOCKED] Set E2E_BASE_URL and E2E_EDITOR_PATH (for example /editor/<templateId>)."); process.exit(2); }
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("[BLOCKED] Playwright is not installed. Run `npm install --no-save playwright && npx playwright install chromium`."); process.exit(2); }
const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info"] });
const page = await browser.newPage();
if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
  await page.goto(`${process.env.E2E_BASE_URL}/auth`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@example.com").fill(process.env.E2E_EMAIL);
  await page.getByPlaceholder("Password (min 6 chars)").fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}
await page.goto(`${process.env.E2E_BASE_URL.replace(/\/$/, "")}${process.env.E2E_EDITOR_PATH}`, { waitUntil: "networkidle" });
const samples = [];
for (let i = 0; i < 12; i++) {
  if (i === 1) await page.keyboard.press("Space");
  await page.waitForTimeout(1000);
  const sample = await page.evaluate(() => {
    const m = performance.memory;
    return m ? { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit } : null;
  });
  samples.push(sample);
}
const valid = samples.filter(Boolean);
const first = valid[0]?.usedJSHeapSize ?? 0; const last = valid.at(-1)?.usedJSHeapSize ?? 0;
const growth = last - first;
console.log(JSON.stringify({ ok: true, samples: valid, heapGrowthBytes: growth, heapGrowthMb: Number((growth/1048576).toFixed(2)) }, null, 2));
await browser.close();
