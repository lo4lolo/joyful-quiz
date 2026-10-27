// 스티커 친구들 (Blender 그림: assets/chars/<id>.png). 그림이 없으면 이모지로 보여 준다.
export const CHARS = [
  { id: 'cat', name: '냥냥이', rarity: 'common', emoji: '🐱' }, { id: 'dog', name: '멍뭉이', rarity: 'common', emoji: '🐶' },
  { id: 'bunny', name: '토토', rarity: 'common', emoji: '🐰' }, { id: 'bear', name: '곰돌이', rarity: 'common', emoji: '🐻' },
  { id: 'panda', name: '판다곰', rarity: 'common', emoji: '🐼' }, { id: 'fox', name: '여우비', rarity: 'common', emoji: '🦊' },
  { id: 'frog', name: '개굴이', rarity: 'common', emoji: '🐸' }, { id: 'penguin', name: '펭펭', rarity: 'common', emoji: '🐧' },
  { id: 'hamster', name: '햄찌', rarity: 'common', emoji: '🐹' }, { id: 'chick', name: '삐약이', rarity: 'common', emoji: '🐤' },
  { id: 'tiger', name: '호랑이', rarity: 'rare', emoji: '🐯' }, { id: 'koala', name: '코코', rarity: 'rare', emoji: '🐨' },
  { id: 'octopus', name: '문문이', rarity: 'rare', emoji: '🐙' }, { id: 'dino', name: '공룡이', rarity: 'rare', emoji: '🦖' },
  { id: 'unicorn', name: '유니콘', rarity: 'legendary', emoji: '🦄' }, { id: 'dragon', name: '꼬마용', rarity: 'legendary', emoji: '🐲' },
];
export const CHAR = Object.fromEntries(CHARS.map(c => [c.id, c]));
export const RARITY = { common: { name: '일반', color: '#8FA3C4' }, rare: { name: '희귀', color: '#3D8BFF' }, legendary: { name: '전설', color: '#FFB800' } };
// 처음부터 고를 수 있는 친구 (나머지는 게임으로 모은 칭찬 도장으로 뽑기)
export const STARTERS = ['cat', 'dog', 'bunny', 'bear', 'panda', 'fox', 'frog', 'penguin'];
export const charImg = id => `assets/chars/${id}.png`;
export const emojiOf = a => CHAR[a?.char]?.emoji || a?.face || '🐱';

// 재미있는 별명 (선생님이 '별명 모드'를 켜면 친구들 화면에 이름 대신 보임)
const ADJ = ['반짝이는', '용감한', '말랑한', '씩씩한', '졸린', '배고픈', '신나는', '수줍은', '날쌘', '똑똑한', '웃는', '꿈꾸는', '빙글빙글', '보송보송', '튼튼한', '상냥한'];
const NOUN = ['고구마', '구름', '감자', '별사탕', '도토리', '젤리', '만두', '호떡', '솜사탕', '단추', '연필', '지우개', '풍선', '눈사람', '붕어빵', '해바라기'];
export const randomNick = () => ADJ[Math.random() * ADJ.length | 0] + ' ' + NOUN[Math.random() * NOUN.length | 0];
