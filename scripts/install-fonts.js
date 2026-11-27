import { mkdirSync, readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dir=fileURLToPath(new URL('../assets/fonts/',import.meta.url));
const revision='f8d157532fbfaeda587e826d4cd5b21a49186f7c';
const hashes={Regular:'2a2eae2628df83556c54018c41e20fa532c1b862c5256ae8b3f23feb918d12ca',Bold:'8af07d4b6c2e82bcc72a30e066eaf295f11b9424f4aad2eaa9fe0e9c3b38fc73'};
const digest=data=>createHash('sha256').update(data).digest('hex');
mkdirSync(dir,{recursive:true});
for(const [weight,expected] of Object.entries(hashes)){
  const name=`NotoSerifCJKsc-${weight}.otf`,path=join(dir,name);
  if(existsSync(path)&&digest(readFileSync(path))===expected){console.log(`${name}: verified`);continue;}
  const url=`https://raw.githubusercontent.com/notofonts/noto-cjk/${revision}/Serif/OTF/SimplifiedChinese/${name}`;
  const data=execFileSync('curl',['--fail','--silent','--show-error','--location','--connect-timeout','10','--max-time','180',url],{maxBuffer:40*1024*1024,timeout:181000});
  if(digest(data)!==expected)throw new Error(`${name}: checksum mismatch`);
  writeFileSync(path+'.tmp',data);renameSync(path+'.tmp',path);console.log(`${name}: downloaded and verified`);
}
