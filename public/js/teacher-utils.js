// 교사가 입력한 문항을 조용히 누락하지 않도록, 출발 전에 수정할 위치를 돌려준다.
export function questionIssues(rows) {
  const issues = [];
  rows.forEach((row, index) => {
    const keys = ['q', 'a', 'w1', 'w2', 'w3', 'ex'];
    if (!keys.some(key => String(row[key] ?? '').trim())) return;
    for (const [key, label] of [['q', '문제'], ['a', '정답']]) {
      if (!String(row[key] ?? '').trim()) issues.push({ row: index, key, message: `${index + 1}번 ${label}을 입력해 주세요.` });
    }
    for (const key of keys) if (String(row[key] ?? '').trim().length > (key === 'q' || key === 'ex' ? 300 : 80)) {
      issues.push({ row: index, key, message: `${index + 1}번 ${key === 'q' ? '문제' : key === 'ex' ? '해설' : '답'}이 너무 길어요.` });
    }
  });
  if (rows.filter(row => String(row.q ?? '').trim() && String(row.a ?? '').trim()).length > 300) {
    issues.push({ row: 300, key: 'q', message: '한 세트는 300문항까지 사용할 수 있어요. 세트를 나누어 주세요.' });
  }
  return issues;
}

export function selectSets(sets, query = '', sort = 'recent') {
  const term = query.normalize('NFC').trim().toLocaleLowerCase();
  return sets.filter(set => !term || `${set.title || ''} ${set.rows.map(row => row.q || '').join(' ')}`.normalize('NFC').toLocaleLowerCase().includes(term))
    .sort(sort === 'title' ? (a, b) => (a.title || '').localeCompare(b.title || '', 'ko') : (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
