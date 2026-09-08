import { createFileRoute } from "@tanstack/react-router";
import { getPublisherFleetHealth, processPublishQueue } from "@/lib/youtube-publisher-v2.server";
import { getControlPlaneHealth } from "@/lib/deployment-control-plane.server";

function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function authorized(r:Request){const s=process.env.CRON_SECRET;if(!s)return false;const b=r.headers.get("authorization")??"",x=r.headers.get("x-cron-secret")??"";return (b.length>7&&safeEqual(b,`Bearer ${s}`))||(x.length>0&&safeEqual(x,s));}

export const Route=createFileRoute("/api/public/hooks/process-publisher")({server:{handlers:{
  POST:async({request})=>{if(!authorized(request))return new Response("Unauthorized",{status:401});try{const faultCheckpoint=request.headers.get("x-phase9-fault-checkpoint")??undefined;const faultCampaignItemId=request.headers.get("x-phase9-fault-item")??undefined;return Response.json({ok:true,publishing:await processPublishQueue({faultCheckpoint,faultCampaignItemId}),control:await getControlPlaneHealth()});}catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"unknown"},{status:500});}},
  GET:async({request})=>{if(!authorized(request))return new Response("Unauthorized",{status:401});return Response.json({ok:true,publisherFleet:await getPublisherFleetHealth(),control:await getControlPlaneHealth()});},
}}});
