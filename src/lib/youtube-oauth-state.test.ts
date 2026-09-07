import { describe, expect, it } from "vitest";
import {
  parseYouTubeOAuthState,
  signYouTubeOAuthState,
  timingSafeStringEqual,
  verifyYouTubeOAuthStateSignature,
  youtubeOAuthRedirectUri,
} from "@/lib/youtube-oauth-state";

const secret = "phase0-test-state-secret-at-least-32-chars";

describe("YouTube OAuth state contract", () => {
  it("signs and verifies state without exposing a server session token", async () => {
    const issued = Date.now().toString(36);
    const payload = `user-1.nonce123.${issued}`;
    const signature = await signYouTubeOAuthState(payload, secret);
    const state = `${payload}.${signature}`;
    const parsed = parseYouTubeOAuthState(state);
    expect(parsed?.userId).toBe("user-1");
    expect(await verifyYouTubeOAuthStateSignature(parsed!.payload, parsed!.signature, secret)).toBe(true);
    expect(await verifyYouTubeOAuthStateSignature(parsed!.payload, parsed!.signature, `${secret}-wrong`)).toBe(false);
  });

  it("uses one deterministic callback URI for authorization and token exchange", () => {
    expect(youtubeOAuthRedirectUri("https://app.example.com/"))
      .toBe("https://app.example.com/api/public/youtube/callback");
  });

  it("compares the state cookie and query state exactly", () => {
    expect(timingSafeStringEqual("same", "same")).toBe(true);
    expect(timingSafeStringEqual("same", "tampered")).toBe(false);
  });
});
