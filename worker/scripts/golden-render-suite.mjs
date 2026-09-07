import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ChromiumFrameRenderer } from '../src/chromium-renderer.mjs';
import { goldenFixtures, GOLDEN_SUITE_VERSION } from '../src/golden-fixtures.mjs';
import { comparePngSsim } from '../src/pixel-parity.mjs';
import { buildFontCatalogCss, fontFilePath, FONT_CATALOG_VERSION } from '../src/font-catalog.mjs';
import { startAssetServer } from '../src/asset-cache.mjs';

const update=process.argv.includes('--update');
const min=Number(process.env.GOLDEN_MIN_SSIM||0.995);
const root=resolve(new URL('../goldens',import.meta.url).pathname);
const refDir=join(root,'references'),candidateDir=join(root,'candidates');
await mkdir(refDir,{recursive:true});await mkdir(candidateDir,{recursive:true});
const fontCss=await buildFontCatalogCss();const server=await startAssetServer({assetMap:new Map(),fontCss,fontFilePath});
let failed=0,total=0,worst=1;const details=[];
try{
 for(const fixture of goldenFixtures){const renderer=new ChromiumFrameRenderer({width:fixture.width,height:fixture.height,fontStylesheetUrl:`${server.base}/__fonts__/catalog.css`});await renderer.start();
  try{for(const t of fixture.timestamps){const key=`${fixture.id}-${String(Math.round(t*1000)).padStart(5,'0')}.png`;const candidate=join(candidateDir,key);await renderer.renderFrame(fixture.frame(t),candidate);const reference=join(refDir,key);
    if(update){await writeFile(reference,await readFile(candidate));details.push({key,ssim:1,updated:true});continue;}
    try{await readFile(reference);}catch{throw new Error(`Missing golden reference ${key}. Run npm --prefix worker run goldens:update intentionally and review the images.`)}
    const result=await comparePngSsim(reference,candidate);total++;worst=Math.min(worst,result.ssim);if(result.ssim<min)failed++;details.push({key,ssim:result.ssim,pass:result.ssim>=min});
  }}finally{await renderer.close();}
 }
}finally{await server.close();}
const report={suiteVersion:GOLDEN_SUITE_VERSION,fontCatalogVersion:FONT_CATALOG_VERSION,minimumSsim:min,total,failed,worstSsim:worst,generatedAt:new Date().toISOString(),details};await writeFile(join(root,'last-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(!update&&failed)process.exit(1);
