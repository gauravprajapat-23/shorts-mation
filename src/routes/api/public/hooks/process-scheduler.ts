import { createFileRoute } from "@tanstack/react-router";
import { dispatchUpcomingCampaignItems } from "@/lib/campaign-scheduler.server";
import { submitDueRenders, collectFinishedRenders } from "@/lib/render-pipeline.server";
import { getControlPlaneHealth } from "@/lib/deployment-control-plane.server";
import { processR2Cleanup } from "@/lib/r2-retention.server";

function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function authorized(r:Request){const s=process.env.CRON_SECRET;if(!s)return false;const b=r.headers.get("authorization")??"",x=r.headers.get("x-cron-secret")??"";return (b.length>7&&safeEqual(b,`Bearer ${s}`))||(x.length>0&&safeEqual(x,s));}

export const Route=createFileRoute("/api/public/hooks/process-scheduler")({server:{handlers:{
  POST:async({request})=>{if(!authorized(request))return new Response("Unauthorized",{status:401});try{const dispatch=await dispatchUpcomingCampaignItems();if(!dispatch.leaderAcquired)return Response.json({ok:true,role:"follower",dispatch,control:await getControlPlaneHealth()});const renders=await submitDueRenders();const collected=await collectFinishedRenders();const postRenderDispatch=await dispatchUpcomingCampaignItems();const cleanup=await processR2Cleanup(Number(process.env.R2_CLEANUP_PER_TICK??10));return Response.json({ok:true,role:"leader",dispatch,renders,collected,postRenderDispatch,cleanup,control:await getControlPlaneHealth()});}catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"unknown"},{status:500});}},
  GET:async({request})=>authorized(request)?Response.json({ok:true,control:await getControlPlaneHealth()}):new Response("Unauthorized",{status:401}),
}}});
