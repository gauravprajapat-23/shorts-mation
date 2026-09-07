import test from 'node:test';import assert from 'node:assert/strict';import {documentHtml} from './chromium-renderer.mjs';import {assertParity} from './pixel-parity.mjs';
test('Chromium document freezes animation and uses exact viewport',()=>{const html=documentHtml('<b>x</b>',1080,1920,'http://127.0.0.1/fonts.css');assert.match(html,/width:1080px/);assert.match(html,/height:1920px/);assert.match(html,/animation-play-state:paused/);});
test('pixel parity budget rejects low SSIM',()=>{assert.throws(()=>assertParity({ssim:.9},{minimumSsim:.995}),/Pixel parity failed/);});
