import { esc } from './common.js';
export function renderReview(el, data) {
  if (!el) return;
  const s = data?.summary;
  if (!s) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="learning-card"><div class="learning-heading"><span>🌱</span><div><h2>오늘 자란 나의 실력</h2><p>게임 순위와 따로, 내가 풀어 본 문제를 돌아봐요.</p></div></div>
    <div class="learning-numbers"><div><b>${s.seen}/${s.total}</b>만난 문제</div><div><b>${s.secure}</b>최근에 맞힌 문제</div><div><b>${s.recovered}</b>다시 도전해 성공</div><div><b>${s.review}</b>더 연습할 문제</div></div>
    <p class="learning-note">첫 시도 정답 ${s.firstCorrect}개 · 아직 만나지 않은 문제 ${Math.max(0, s.total - s.seen)}개</p>
    ${data.cards?.length ? `<h3>다시 생각하는 노트</h3><p class="learning-note">답을 먼저 떠올린 뒤 카드를 열어 확인해요. 이 복습은 게임 점수를 바꾸지 않아요.</p>
    <div class="review-cards">${data.cards.map(c => `<details><summary><span>${c.recovered ? '🌿' : '🌱'} ${esc(c.q)}</span><small>${c.recovered ? '다시 맞혔어요' : '한 번 더 생각해요'}</small></summary><div><p>내가 쓴 답: <b>${esc(c.given || '시간 안에 답하지 못했어요')}</b></p><p class="review-answer">정답: <b>${esc(c.correct)}</b></p>${c.explain ? `<p>💡 ${esc(c.explain)}</p>` : ''}</div></details>`).join('')}</div>`
    : `<p class="review-empty">${s.seen ? '✨ 지금까지 틀린 문제가 없어요! 아직 만나지 않은 문제도 도전해 보세요.' : '다음 게임에서 첫 문제에 도전해 봐요.'}</p>`}
    <p class="learning-note">내 답과 복습 카드는 나와 선생님만 볼 수 있어요. 방이 닫히면 이 화면의 복습 기록도 사라져요.</p></section>`;
}
