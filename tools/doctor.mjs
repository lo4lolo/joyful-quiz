import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let failed=0;
const check=(name,ok)=>{ console.log(`${ok?'[OK]':'[확인 필요]'} ${name}`); if(!ok) failed++; };
check(`Node ${process.version} (실행 18 이상, 개발 검사 22 이상 권장)`,+process.versions.node.split('.')[0]>=18);
try { await import('socket.io'); check('실시간 서버와 연결에 필요한 파일',true); }
catch(e) { check('실시간 서버 파일 누락: 인터넷 연결 후 npm install 실행',false); console.log(e.code || e.message); }
for(const name of ['public/teacher.html','public/teacher-guide.html','public/js/dialogs.js','public/js/teacher-utils.js','public/practice.html','public/js/sample.js','public/js/learning.js','public/assets/models/kart.glb','public/vendor/three.module.min.js','public/vendor/socket.io.min.js','public/vendor/xlsx.full.min.js']) check(name,fs.existsSync(path.join(root,name)));
console.log(failed?'누락된 파일을 복구한 뒤 다시 실행하세요.':'실행에 필요한 기본 파일이 준비됐어요. 실제 기기 접속은 시작 후 확인하세요.');
process.exitCode=failed?1:0;
