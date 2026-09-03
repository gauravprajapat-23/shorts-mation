export type YouTubeCategory={id:string;title:string};
export type YouTubePlaylist={id:string;title:string;itemCount:number};
export type YouTubeUploadDefaults={
  privacy:"private"|"unlisted"|"public";categoryId?:string;playlistId?:string;language?:string;
  madeForKids:boolean;titleTemplate:string;descriptionTemplate:string;hashtagMax:number;appendHashtags:boolean;
};

async function yt<T>(token:string,url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...(init?.headers??{})},signal:AbortSignal.timeout(30_000)});
 if(!res.ok)throw new Error(`YouTube API ${res.status}: ${(await res.text()).slice(0,600)}`);
 return res.json() as Promise<T>;
}
export async function listYouTubeCategories(token:string,regionCode="US"){
 const body=await yt<{items?:Array<{id:string;snippet?:{title?:string;assignable?:boolean}}>}>(token,`https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=${encodeURIComponent(regionCode)}`);
 return (body.items??[]).filter(x=>x.snippet?.assignable!==false).map(x=>({id:x.id,title:x.snippet?.title??x.id}));
}
export async function listYouTubePlaylists(token:string){
 let pageToken="",out:YouTubePlaylist[]=[];
 do{
  const q=new URLSearchParams({part:"snippet,contentDetails",mine:"true",maxResults:"50",...(pageToken?{pageToken}:{})});
  const body=await yt<{nextPageToken?:string;items?:Array<{id:string;snippet?:{title?:string};contentDetails?:{itemCount?:number}}>}>(token,`https://www.googleapis.com/youtube/v3/playlists?${q}`);
  out.push(...(body.items??[]).map(x=>({id:x.id,title:x.snippet?.title??x.id,itemCount:Number(x.contentDetails?.itemCount??0)})));
  pageToken=body.nextPageToken??"";
 }while(pageToken&&out.length<500);
 return out;
}
export async function fetchChannelSnapshot(token:string){
 const body=await yt<{items?:Array<{id:string;snippet?:{title?:string};statistics?:Record<string,string>}>}>(token,"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true");
 const c=body.items?.[0];if(!c)throw new Error("YouTube channel not found");
 return {channelId:c.id,title:c.snippet?.title??"",subscribers:Number(c.statistics?.subscriberCount??0),views:Number(c.statistics?.viewCount??0),videos:Number(c.statistics?.videoCount??0)};
}
export async function fetchVideoStats(token:string,ids:string[]){
 if(!ids.length)return[];
 const out:any[]=[];
 for(let i=0;i<ids.length;i+=50){
  const q=new URLSearchParams({part:"snippet,status,statistics",id:ids.slice(i,i+50).join(",")});
  const body=await yt<{items?:Array<any>}>(token,`https://www.googleapis.com/youtube/v3/videos?${q}`);
  out.push(...(body.items??[]));
 }
 return out;
}
export async function uploadThumbnail(token:string,videoId:string,bytes:Uint8Array,mimeType:string){
 if(bytes.byteLength>2*1024*1024)throw new Error("YouTube thumbnail must be 2 MB or smaller");
 if(!["image/jpeg","image/png"].includes(mimeType))throw new Error("Thumbnail must be JPEG or PNG");
 const res=await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,{
  method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":mimeType,"Content-Length":String(bytes.byteLength)},body:bytes,signal:AbortSignal.timeout(30_000)
 });
 if(!res.ok)throw new Error(`YouTube thumbnail upload failed (${res.status}): ${(await res.text()).slice(0,500)}`);
}
export function renderPublishTemplate(template:string,vars:Record<string,string>){
 return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_,k)=>vars[k]??"");
}
export function normalizeHashtags(values:string[],max=5){
 const out:string[]=[];
 for(const raw of values){const clean=raw.trim().replace(/^#+/,"").replace(/[^\p{L}\p{N}_]/gu,"");if(clean&&!out.includes(clean))out.push(clean);if(out.length>=Math.max(0,Math.min(15,max)))break;}
 return out.map(x=>`#${x}`);
}
export function recommendedPublishHours(performance:Array<{captured_at:string;views:number}>,fallback=[12,15,18,21]){
 if(performance.length<4)return fallback;
 const buckets=new Map<number,{sum:number;n:number}>();
 for(const p of performance){const h=new Date(p.captured_at).getUTCHours(),b=buckets.get(h)??{sum:0,n:0};b.sum+=Number(p.views??0);b.n++;buckets.set(h,b);}
 return [...buckets.entries()].sort((a,b)=>b[1].sum/b[1].n-a[1].sum/a[1].n).slice(0,4).map(([h])=>h);
}

export async function fetchYouTubeAnalyticsReport(token:string,startDate:string,endDate:string){
  const q=new URLSearchParams({
    ids:"channel==MINE",
    startDate,endDate,
    metrics:"views,likes,comments,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained",
    dimensions:"video",
    sort:"-views",
    maxResults:"500",
  });
  const res=await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`,{
    headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30_000),
  });
  if(res.status===403)return [] as Array<any>;
  if(!res.ok)throw new Error(`YouTube Analytics API ${res.status}: ${(await res.text()).slice(0,600)}`);
  const body=await res.json() as {columnHeaders?:Array<{name:string}>;rows?:unknown[][]};
  const headers=(body.columnHeaders??[]).map(h=>h.name);
  return (body.rows??[]).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
}
