import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONT_CATALOG_VERSION = 'shorts-mation-fonts-v1';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const FACES = [
  ['Inter', [400,500,600,700,800,900], '@fontsource/inter'],
  ['Plus Jakarta Sans', [600,700,800,900], '@fontsource/plus-jakarta-sans'],
];

export async function buildFontCatalogCss(){
  const rules=[];
  for(const [family,weights,pkg] of FACES){
    for(const weight of weights){
      const cssPath=join(root,'node_modules',pkg,`${weight}.css`);
      let css;
      try{css=await readFile(cssPath,'utf8');}catch{
        if(process.env.ALLOW_FONT_CATALOG_FALLBACK==='1'){
          const fallback=family==='Inter'?'Liberation Sans':'Liberation Sans';
          rules.push(`@font-face{font-family:${JSON.stringify(family)};font-style:normal;font-weight:${weight};src:local(${JSON.stringify(fallback)});}`);
          continue;
        }
        throw new Error(`Font catalog ${FONT_CATALOG_VERSION} missing ${pkg}/${weight}.css. Run npm install in worker or build the worker image.`)
      }
      // Fontsource CSS uses relative ./files/... URLs. Convert them to worker-local /__fonts__/ URLs.
      css=css.replaceAll('url(./files/',`url(/__fonts__/${pkg.replace('@fontsource/','')}/files/`);
      rules.push(css);
    }
  }
  return `/* ${FONT_CATALOG_VERSION} */\n${rules.join('\n')}`;
}

export function fontFilePath(pathname){
  const m=pathname.match(/^\/__fonts__\/(inter|plus-jakarta-sans)\/files\/([^/]+)$/);
  if(!m)return null;
  return join(root,'node_modules','@fontsource',m[1],'files',m[2]);
}
