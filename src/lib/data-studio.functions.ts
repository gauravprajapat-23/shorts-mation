import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CampaignCreateItem } from "@/lib/campaign-create.functions";

export const generateDataStudioCampaign = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d:{
    studioId?:string|null;
    campaign:{
      name:string;
      youtube_connection_id:string|null;
      template_id:string;
      timezone:string;
      settings_json:Record<string,unknown>;
    };
    items:CampaignCreateItem[];
  })=>d)
  .handler(async({data,context})=>{
    if(!data.campaign.name?.trim()) throw new Error("Campaign name is required");
    if(!data.campaign.template_id) throw new Error("Template is required");
    if(!Array.isArray(data.items)||data.items.length<1||data.items.length>100) {
      throw new Error("Automation Data Studio generates 1–100 videos per campaign");
    }

    const seen=new Set<string>();
    const thumbnailIds=new Set<string>();
    data.items.forEach((item,index)=>{
      const name=String(item.video_file_name??"").trim().toLowerCase();
      if(!name) throw new Error(`Row ${index+1}: video file name is required`);
      if(seen.has(name)) throw new Error(`Row ${index+1}: duplicate video file name`);
      seen.add(name);
      if(item.schedule_at && !Number.isFinite(new Date(item.schedule_at).getTime())) {
        throw new Error(`Row ${index+1}: invalid schedule`);
      }
      const yt=(item.youtube_settings_json??{}) as Record<string,unknown>;
      const thumbnailId=String(yt.thumbnailAssetId??"").trim();
      if(thumbnailId) thumbnailIds.add(thumbnailId);
    });

    if(thumbnailIds.size){
      const {data:thumbs,error:thumbError}=await context.supabase.from("assets")
        .select("id,type,mime_type,size,lifecycle_status")
        .in("id",[...thumbnailIds]).eq("user_id",context.userId).eq("lifecycle_status","active");
      if(thumbError) throw new Error(thumbError.message);
      const valid=new Set((thumbs??[]).filter((a)=>(
        ["image","logo"].includes(String(a.type))
        && ["image/jpeg","image/png"].includes(String(a.mime_type??""))
        && Number(a.size??0)>0
        && Number(a.size??0)<=2*1024*1024
      )).map((a)=>String(a.id)));
      for(const id of thumbnailIds) if(!valid.has(id)) {
        throw new Error("A YouTube thumbnail is missing, not owned by this account, not JPEG/PNG, or larger than 2 MB");
      }
    }

    const {data:result,error}=await (context.supabase as any).rpc("create_campaign_with_items",{
      p_campaign:{...data.campaign,status:"draft"},
      p_items:data.items,
    });
    if(error) throw new Error(error.message);
    const id=Array.isArray(result)?result[0]?.campaign_id:result?.campaign_id??result;
    if(!id) throw new Error("Campaign transaction did not return an id");
    const campaignId=String(id);

    if(data.studioId){
      const {error:markError}=await (context.supabase as any).rpc("mark_data_studio_generated",{
        p_studio_id:data.studioId,p_campaign_id:campaignId,
      });
      if(markError) {
        // Campaign creation has committed already. Do not falsely report a
        // failed generation merely because optional draft bookkeeping failed.
        console.warn("Could not link generated campaign back to Data Studio draft:",markError.message);
      }
    }
    return {campaignId,count:data.items.length};
  });
