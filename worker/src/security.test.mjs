import test from "node:test";import assert from "node:assert/strict";import {signature,verify} from "./security.mjs";
test("signed worker request",()=>{const ts=String(Date.now()),body='{"x":1}',s=signature("abcdefghijklmnopqrstuvwxyz",ts,body);assert.equal(verify("abcdefghijklmnopqrstuvwxyz",ts,body,s),true);assert.equal(verify("wrong",ts,body,s),false);});
