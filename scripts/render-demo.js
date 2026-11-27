import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { demoSnapshot } from '../src/service.js';
import { renderSvg, renderPng } from '../src/render.js';
const dir=fileURLToPath(new URL('../outputs/demo/',import.meta.url));mkdirSync(dir,{recursive:true});
for(const page of ['weather','work']){const svg=renderSvg(page,demoSnapshot());writeFileSync(join(dir,`${page}.svg`),svg);writeFileSync(join(dir,`${page}.png`),renderPng(svg));console.log(`Rendered demo ${page}: 1072 × 1448`);}
