import { spawn } from 'node:child_process';

export async function comparePngSsim(referencePng,candidatePng){
  const args=['-v','info','-i',referencePng,'-i',candidatePng,'-lavfi','[0:v][1:v]ssim','-f','null','-'];
  const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']}); let stderr=''; p.stderr.on('data',d=>stderr+=String(d));
  const code=await new Promise((resolve,reject)=>{p.on('exit',resolve);p.on('error',reject)}); if(code!==0)throw new Error(`pixel parity ffmpeg failed (${code}): ${stderr.slice(-2000)}`);
  const matches=[...stderr.matchAll(/SSIM[^\n]*All:([0-9.]+)/g)]; const last=matches.at(-1); if(!last)throw new Error(`Could not parse SSIM from ffmpeg output: ${stderr.slice(-2000)}`);
  const ssim=Number(last[1]); return {ssim,exact:ssim>=0.999999,withinDefaultBudget:ssim>=0.995};
}

export function assertParity(result,{minimumSsim=0.995}={}){if(result.ssim<minimumSsim)throw new Error(`Pixel parity failed: SSIM ${result.ssim.toFixed(6)} < ${minimumSsim}`);return result;}
