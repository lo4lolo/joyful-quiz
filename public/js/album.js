// 내 스티커북: 게임에서 받은 칭찬 도장으로 스티커 친구를 뽑는다. 이 기기 브라우저에만 저장 (서버로 보내지 않음).
import { store } from './common.js';
import { CHARS, CHAR, STARTERS } from './chars.js';

const KEY = 'jq_album', COST = 10, DUP_BACK = 3;
const load = () => { const a = store.get(KEY, null) || {}; return { stamps: a.stamps | 0, owned: [...new Set([...(a.owned || []), ...STARTERS])].filter(id => CHAR[id]), seen: a.seen || [] }; };
const save = a => store.set(KEY, a);

export const album = {
  COST,
  get: load,
  owns: id => load().owned.includes(id),
  // 게임이 끝나면 도장 주기 (같은 게임은 한 번만)
  award(n, gameKey) {
    const a = load(); if (gameKey && a.seen.includes(gameKey)) return 0;
    a.stamps += Math.max(0, n | 0); if (gameKey) a.seen = [...a.seen, gameKey].slice(-40); save(a); return n;
  },
  draw() {
    const a = load(); if (a.stamps < COST) return { error: `칭찬 도장이 ${COST - a.stamps}개 더 필요해요` };
    a.stamps -= COST;
    const r = Math.random() * 100, rarity = r < 5 ? 'legendary' : r < 25 ? 'rare' : 'common';
    const pool = CHARS.filter(c => c.rarity === rarity);
    const c = pool[Math.random() * pool.length | 0];
    const dup = a.owned.includes(c.id);
    if (dup) a.stamps += DUP_BACK; else a.owned.push(c.id);
    save(a);
    return { char: c, dup, stamps: a.stamps };
  },
};
