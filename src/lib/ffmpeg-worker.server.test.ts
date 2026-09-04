import {describe,expect,it} from "vitest";
import {workerRequestSignature} from "@/lib/ffmpeg-worker.server";
describe("native FFmpeg worker contract",()=>{it("signs idempotent submissions deterministically",()=>{expect(workerRequestSignature("abcdefghijklmnopqrstuvwxyz","123","{}" )).toBe(workerRequestSignature("abcdefghijklmnopqrstuvwxyz","123","{}"));expect(workerRequestSignature("abcdefghijklmnopqrstuvwxyz","123","{}" )).not.toBe(workerRequestSignature("abcdefghijklmnopqrstuvwxyz","124","{}"));});});
