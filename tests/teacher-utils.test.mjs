import test from 'node:test';
import assert from 'node:assert/strict';
import { questionIssues, selectSets } from '../public/js/teacher-utils.js';

test('빈 줄은 무시하지만 정답 없는 문제와 문제 없는 정답은 위치와 함께 알린다', () => {
  assert.deepEqual(questionIssues([{q:'',a:''},{q:'지층은?',a:''},{q:'',a:'퇴적암'}]).map(x=>[x.row,x.key]), [[1,'a'],[2,'q']]);
});
test('해설만 적은 미완성 줄도 조용히 버리지 않는다', () => {
  assert.equal(questionIssues([{ex:'설명'}]).length,2);
});
test('붙여넣기로 길어진 문항과 서버 한도를 넘는 세트는 미리 알린다', () => {
  assert.equal(questionIssues([{q:'문제',a:'가'.repeat(81)}])[0].key,'a');
  assert.match(questionIssues(Array.from({length:301},()=>({q:'문제',a:'답'})))[0].message,/300문항/);
});
test('검색은 제목과 문제를 찾고 정렬해도 원본 순서를 바꾸지 않는다', () => {
  const sets=[{title:'과학',rows:[{q:'지층'}],updatedAt:1},{title:'국어',rows:[{q:'시'}],updatedAt:2}];
  assert.equal(selectSets(sets,'지층')[0].title,'과학');
  assert.equal(selectSets(sets,'없는 검색어').length,0);
  assert.equal(selectSets(sets)[0].title,'국어');
  assert.equal(sets[0].title,'과학');
});
