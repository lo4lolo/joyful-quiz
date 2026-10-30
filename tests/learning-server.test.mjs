import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {io as Client} from 'socket.io-client';
import {server,io,rooms,MODES} from '../server.js';
let url;
before(()=>new Promise(r=>server.listen(0,()=>{url=`http://localhost:${server.address().port}`;r();})));
after(()=>new Promise(r=>{io.close(r);server.closeAllConnections?.();}));
const call=(s,e,d={})=>s.timeout(3000).emitWithAck(e,d);
const conn=()=>new Promise(r=>{const s=Client(url,{transports:['websocket'],forceNew:true});s.on('connect',()=>r(s));});
test('개인 복습은 종료 후 본인에게만 공개되고 다시 시작하면 초기화된다',async t=>{
  const teacher=await conn(),a=await conn(),b=await conn(); t.after(()=>{teacher.close();a.close();b.close();});
  const c=await call(teacher,'t:create',{title:'학습 검사',mode:'race',questions:[{q:'1+1',a:'2',wrong:['3'],explain:'하나씩 더해요'}]});
  const ja=await call(a,'s:join',{code:c.code,name:'가상A'}); await call(b,'s:join',{code:c.code,name:'가상B'});
  await call(teacher,'t:start'); const room=rooms.get(c.code),p=room.players.get(ja.pid);
  room.api.ask(p,0); assert.equal((await call(a,'s:answer',{qid:0,given:'3'})).ok,false);
  assert.deepEqual((await call(a,'s:learning')).cards,[],'게임 중 정답 노트 비공개');
  await call(teacher,'t:end');
  const note=await call(a,'s:learning'); assert.equal(note.cards[0].correct,'2'); assert.equal(note.summary.review,1);
  assert.deepEqual((await call(b,'s:learning')).cards,[]);
  await call(teacher,'t:purge'); assert.equal(room.log.length,0); assert.equal((await call(a,'s:learning')).cards.length,1);
  await call(teacher,'t:start'); assert.equal((await call(a,'s:learning')).summary.seen,0);
  await call(teacher,'t:close');
});
test('만료된 답으로 보상을 받지 못하고 바뀐 기기의 이전 연결은 답할 수 없다',async t=>{
  const teacher=await conn(),a=await conn(),b=await conn();t.after(()=>{teacher.close();a.close();b.close();});
  const c=await call(teacher,'t:create',{mode:'race',questions:[{q:'OX',a:'O'}],settings:{time:5}});
  const j=await call(a,'s:join',{code:c.code,name:'가상학생'});await call(teacher,'t:start');
  const room=rooms.get(c.code),p=room.players.get(j.pid);room.api.ask(p,0);p.pending.sentAt-=7000;
  const r=await call(a,'s:answer',{qid:0,given:'O'});assert.equal(r.ok,false);assert.equal(r.timedOut,true);assert.equal(p.m.correct,0);
  await call(b,'s:join',{code:c.code,token:j.token,name:'가상학생'});room.api.ask(p,0);
  assert.ok((await call(a,'s:answer',{qid:0,given:'O'})).error);assert.equal((await call(b,'s:answer',{qid:0,given:'O'})).ok,true);
  await call(teacher,'t:close');
});
test('주행 도움 설정은 기본 켜짐이고 직접 운전 선택과 재접속 스냅샷에 유지된다',()=>{
  assert.equal(MODES.race.settings({}).driving,'assist');assert.equal(MODES.race.settings({driving:'manual'}).driving,'manual');
  const room={settings:MODES.race.settings({driving:'manual'}),players:new Map()};
  MODES.race.start(room,{toAll(){},feed(){}});assert.equal(MODES.race.snapshot(room,null).driving,'manual');
});
