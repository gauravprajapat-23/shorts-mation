#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const [envName, ...vitestArgs] = process.argv.slice(2);
if (!envName) throw new Error("Usage: run-vitest-with-env.mjs ENV_NAME <vitest args...>");
const bin = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(bin, ["vitest", ...vitestArgs], { stdio: "inherit", env: { ...process.env, [envName]: "1" } });
process.exit(result.status ?? 1);
