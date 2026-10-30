import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLearning, nextQuestion, recordAnswer, learningSummary, reviewCards } from '../public/js/learning.js';
import { makeBackup, parseBackup, mergeBackup } from '../public/js/library-backup.js';
import { cleanQuestions, studentView } from '../server/quiz.js';
import { buildRecord, validateRecord } from '../public/js/record.js';

test('오답은 다른 두 문항을 답한 뒤 다시 만나고, 정답이면 복습 대기에서 빠진다', () => {
  const s = newLearning(), ids = [0,1,2,3,4]; s.deck = [4,3,2,1];
  recordAnswer(s,0,false,'실수');
  assert.equal(nextQuestion(s,ids,0),1); recordAnswer(s,1,true);
  assert.equal(nextQuestion(s,ids,1),2); recordAnswer(s,2,true);
  assert.equal(nextQuestion(s,ids,2),0); recordAnswer(s,0,true);
  assert.equal(nextQuestion(s,ids,0),3);
  assert.deepEqual(learningSummary(s,5), {total:5,seen:3,secure:3,review:0,recovered:1,firstCorrect:2,attempts:4,correct:3,streak:3});
});
test('문항이 1개여도 진행되며 한 주기 경계에서 같은 문제를 연달아 내지 않는다', () => {
  const s=newLearning(); assert.equal(nextQuestion(s,[0],0),0);
  for(let i=0,last=-1;i<40;i++) { const q=nextQuestion(s,[0,1,2],last); assert.notEqual(q,last); last=q; recordAnswer(s,q,true); }
});
test('복습을 끄면 오답 대기보다 섞인 순서를 따른다', () => {
  const s=newLearning(); recordAnswer(s,0,false); recordAnswer(s,1,true); recordAnswer(s,2,true); s.deck=[3];
  assert.equal(nextQuestion(s,[0,1,2,3],2,false),3);
});
test('계속 틀리는 학생도 전체 문제를 만나며 복습 기록은 문항 수 이내다', () => {
  const s=newLearning(), ids=Array.from({length:12},(_,i)=>i); let last=-1;
  for(let i=0;i<300;i++) { const q=nextQuestion(s,ids,last); recordAnswer(s,q,false); last=q; }
  assert.equal(Object.keys(s.items).length,12); assert.ok(s.deck.length<=12);
});
test('복습 노트는 틀린 문제만, 첫 오답과 회복을 함께 남긴다', () => {
  const s=newLearning(), q=cleanQuestions([{q:'더하기',a:'2',explain:'1+1=2'},{q:'빼기',a:'0'}]);
  recordAnswer(s,0,false,'3'); recordAnswer(s,0,true); recordAnswer(s,1,true);
  assert.deepEqual(reviewCards(s,q),[{qid:0,q:'더하기',correct:'2',explain:'1+1=2',given:'3',recovered:true}]);
});
test('정답과 중복인 오답·동일 보기를 제거하고 학생에게 정답 목록은 보내지 않는다', () => {
  const q=cleanQuestions([{q:'수도',answers:['서울',' 서울 '],wrong:['서울','부산',' 부산 ']}]);
  assert.deepEqual(q[0].answers,['서울']); assert.deepEqual(q[0].wrong,['부산']);
  const v=studentView(q,0,'pc',20); assert.equal(v.choices.length,2); assert.equal(v.answers,undefined);
});
const set={id:'old',title:'수학',rows:[{q:'1+1',a:'2',w1:'3',ex:'더해요'}],updatedAt:123};
test('교사 기록 JSON 재읽기에서도 개인 학습 집계와 시간 초과가 보존된다', () => {
  const learning = {total:12,seen:3,secure:2,review:1,recovered:1,firstCorrect:1,attempts:4,correct:2,streak:1};
  const rec=buildRecord({players:[{pid:'a',name:'가상학생'}],questions:[{q:'1+1',a:'2'}],log:[{pid:'a',qid:0,ok:false,given:'',timedOut:true}],ranking:[{pid:'a',score:100,rank:1,extra:{learning:{...learning,secret:'exclude'}}}]});
  const restored=validateRecord(JSON.parse(JSON.stringify(rec)));
  assert.deepEqual(restored.ranking[0].extra.learning,learning); assert.equal(restored.answers[0].timedOut,true);
});
test('보관함 백업 왕복은 문항과 제목만 담고 학생·교사 인증 정보는 포함하지 않는다', () => {
  const b=makeBackup([{...set,token:'secret',students:['name']}]);
  const text=JSON.stringify(b); assert.ok(!text.includes('secret')); assert.ok(!text.includes('students'));
  const s=parseBackup(text); assert.equal(s[0].title,'수학'); assert.equal(s[0].rows[0].q,'1+1');
});
test('보관함 복원은 기존 세트를 보존하고 같은 내용은 건너뛰며 변경본은 복사한다', () => {
  const a=parseBackup(JSON.stringify(makeBackup([set]))); const b={...a[0],rows:[{q:'2+2',a:'4'}]};
  const r=mergeBackup([set],[a[0],b,b],()=> 'new');
  assert.equal(r.added,1); assert.equal(r.skipped,2); assert.equal(r.sets[0],set); assert.equal(r.sets[1].id,'new');
});
test('잘못된 보관함은 일부만 저장하지 않고 거부한다', () => {
  for(const text of ['{','{}',JSON.stringify({...makeBackup([set]),version:99}),JSON.stringify(makeBackup([{...set,rows:[{q:{bad:true},a:'2'}]}]))]) assert.throws(()=>parseBackup(text));
  assert.throws(()=>parseBackup(' '.repeat(5*1024*1024+1)),/5MB/);
});
