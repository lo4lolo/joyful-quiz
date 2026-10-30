import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), pub=path.join(root,'public');
let html=await fs.readFile(path.join(pub,'teacher-guide.html'),'utf8');
for(const match of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]) {
  const cssPath=path.join(pub,match[1]); let css=await fs.readFile(cssPath,'utf8');
  for(const font of [...css.matchAll(/url\(([^)]+\.woff2)\)/g)]) {
    const bytes=await fs.readFile(path.resolve(path.dirname(cssPath),font[1]));
    css=css.replaceAll(font[0],`url(data:font/woff2;base64,${bytes.toString('base64')})`);
  }
  html=html.replace(match[0],`<style>${css}</style>`);
}
for(const match of [...html.matchAll(/src="(assets\/guide-v06\/[^"\s]+)"/g)]) {
  const bytes=await fs.readFile(path.join(pub,match[1]));
  html=html.replaceAll(match[0],`src="data:image/jpeg;base64,${bytes.toString('base64')}"`);
}
const js=await fs.readFile(path.join(pub,'js/teacher-guide.js'),'utf8');
html=html.replace('<script src="js/teacher-guide.js" defer></script>',`<script>${js.replaceAll('</script','<\\/script')}</script>`);
const output=path.join(root,'교사용_사용가이드_v0.6.html');
await fs.writeFile(output,html,'utf8');
console.log(`교사용 가이드: ${output} (${Buffer.byteLength(html)} bytes, 그림·글꼴 포함)`);
