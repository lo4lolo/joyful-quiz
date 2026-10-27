// 모둠: 사신·상서로운 동물 이름 (전통놀이 모드와 팀 모드가 함께 씀)
export const TEAMS = [
  { id: 'cheongryong', name: '청룡', color: '#3D8BFF', emoji: '🐉' },
  { id: 'jujak', name: '주작', color: '#FF6F61', emoji: '🐦' },
  { id: 'bonghwang', name: '봉황', color: '#FFC83D', emoji: '🐤' },
  { id: 'haechi', name: '해치', color: '#2ED3A0', emoji: '🦁' },
  { id: 'baekho', name: '백호', color: '#8FA3C4', emoji: '🐯' },
  { id: 'hyeonmu', name: '현무', color: '#8C6CFF', emoji: '🐢' },
];
export const MAX_TEAMS = TEAMS.length;

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// n개 모둠으로 고르게 나누기. keep=true 이면 이미 맞는 모둠에 있는 학생은 그대로 두고 넘치는 모둠만 고른다.
export function assignTeams(players, n, keep = true) {
  const list = [...players];
  if (!n) { list.forEach(p => { p.team = null; }); return; }
  const size = Array(n).fill(0);
  const target = Math.ceil(list.length / n);
  const loose = [];
  for (const p of shuffle(list)) {
    if (keep && Number.isInteger(p.team) && p.team >= 0 && p.team < n && size[p.team] < target) size[p.team]++;
    else loose.push(p);
  }
  for (const p of loose) { const t = size.indexOf(Math.min(...size)); p.team = t; size[t]++; }
}
export function smallestTeam(players, n) {
  const size = Array(n).fill(0);
  for (const p of players) if (Number.isInteger(p.team) && p.team < n) size[p.team]++;
  return size.indexOf(Math.min(...size));
}
