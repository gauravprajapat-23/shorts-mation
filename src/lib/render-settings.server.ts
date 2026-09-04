import type { FfmpegWorkerConfig } from "@/lib/ffmpeg-worker.server";
const PROJECT_URL = "https://project--1f227d26-fb40-4f58-b063-0860a2b9495f.lovable.app";
export function appBaseUrl(){return (process.env.PUBLIC_APP_URL||PROJECT_URL).replace(/\/+$/,'');}
export function renderCallbackBaseUrl(){return `${appBaseUrl()}/api/public/hooks/render-callback`;}
export function renderManifestBaseUrl(){return `${appBaseUrl()}/api/public/render-manifest`;}
export async function getRenderWorkerConfig(userId:string):Promise<FfmpegWorkerConfig|null>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data}=await supabaseAdmin.from("render_providers").select("worker_url,worker_secret_encrypted").eq("user_id",userId).maybeSingle();
  if(data?.worker_url&&data.worker_secret_encrypted){
    const {decryptToken}=await import("@/lib/token-crypto.server");
    const secret=await decryptToken(data.worker_secret_encrypted);if(secret)return {url:data.worker_url,secret};
  }
  const url=process.env.FFMPEG_WORKER_URL;const secret=process.env.FFMPEG_WORKER_SECRET;
  return url&&secret?{url,secret}:null;
}
export async function hasRenderCredentials(userId:string){return Boolean(await getRenderWorkerConfig(userId));}
