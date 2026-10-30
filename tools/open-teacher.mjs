import {spawn} from 'node:child_process';
const port=Number(process.env.PORT)||3030;
if(!Number.isInteger(port)||port<1||port>65535) process.exit(1);
const url=`http://localhost:${port}`;
for(let i=0;i<40;i++) {
  try {
    const r=await fetch(url+'/api/info',{signal:AbortSignal.timeout(700)});
    const data=await r.json();
    if(data.modes?.some(m=>m.id==='race')) {
      const child=spawn('cmd.exe',['/d','/c','start','',url+'/teacher.html'],{windowsHide:true,stdio:'ignore'});
      child.unref(); break;
    }
  } catch {}
  await new Promise(r=>setTimeout(r,500));
}
