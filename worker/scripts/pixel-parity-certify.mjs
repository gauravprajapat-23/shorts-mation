import { comparePngSsim,assertParity } from '../src/pixel-parity.mjs';
const [reference,candidate,minArg]=process.argv.slice(2); if(!reference||!candidate){console.error('Usage: node scripts/pixel-parity-certify.mjs <browser-preview.png> <server-frame.png> [minimum-ssim]');process.exit(2)}
const minimumSsim=minArg?Number(minArg):Number(process.env.PIXEL_PARITY_MIN_SSIM||0.995); const result=await comparePngSsim(reference,candidate); console.log(JSON.stringify({...result,minimumSsim},null,2)); assertParity(result,{minimumSsim});
