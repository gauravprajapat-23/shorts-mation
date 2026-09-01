#!/usr/bin/env node
const required = ["E2E_BASE_URL", "E2E_EMAIL", "E2E_PASSWORD", "E2E_TEMPLATE_NAME"];
for (const key of required) if (!process.env[key]) { console.error(`[BLOCKED] ${key} is required for Playwright release E2E.`); process.exit(2); }
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("[BLOCKED] Playwright is not installed. Run `npm install --no-save playwright && npx playwright install chromium` in the certification runner."); process.exit(2); }
const base = process.env.E2E_BASE_URL.replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const failures = [];
page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") failures.push(`console: ${m.text()}`); });
try {
  await page.goto(`${base}/auth`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@example.com").fill(process.env.E2E_EMAIL);
  await page.getByPlaceholder("Password (min 6 chars)").fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });

  await page.goto(`${base}/templates/new`, { waitUntil: "networkidle" });
  const name = `${process.env.E2E_TEMPLATE_NAME}-${Date.now()}`;
  const input = page.locator('input').first();
  await input.fill(name);
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/editor\//, { timeout: 30000 });
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(JSON.stringify({ ok: true, auth: true, templateCreation: true, editorLoaded: true, url: page.url() }, null, 2));
} finally { await browser.close(); }
