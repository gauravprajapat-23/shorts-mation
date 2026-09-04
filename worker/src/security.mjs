import {createHmac,timingSafeEqual} from "node:crypto";
export const signature=(secret,ts,body)=>createHmac("sha256",secret).update(`${ts}.${body}`).digest("hex");
export function verify(secret,ts,body,sig,maxSkewMs=300000){if(!secret||!ts||!sig||Math.abs(Date.now()-Number(ts))>maxSkewMs)return false;const a=Buffer.from(signature(secret,ts,body));const b=Buffer.from(sig);return a.length===b.length&&timingSafeEqual(a,b);}
