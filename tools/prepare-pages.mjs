import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function serverOrigin(value) {
  if (!value?.trim()) throw new Error('SERVER_URL이 비어 있습니다. 실제 게임 서버 주소를 먼저 연결하세요.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('SERVER_URL은 올바른 HTTPS 주소여야 합니다.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /^(localhost|127\.|\[::1\])/.test(url.hostname)) {
    throw new Error('SERVER_URL에는 경로·인증정보 없는 공개 HTTPS 서버 주소를 넣으세요.');
  }
  return url.origin;
}

export async function preparePages({ root, output, server, commit = '' }) {
  const origin = serverOrigin(server);
  // 원본 public/config.js는 로컬 실행용으로 유지하고 별도 배포 폴더만 만든다.
  await fs.mkdir(output, { recursive: false });
  await fs.cp(path.join(root, 'public'), output, {
    recursive: true,
    filter: source => path.relative(path.join(root, 'public'), source).split(path.sep)[0] !== 'dev',
  });
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(output, 'config.js'), `window.JQ_CONFIG = ${JSON.stringify({ server: origin })};\n`);
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  await fs.writeFile(path.join(output, 'version.json'), JSON.stringify({ version, commit, server: origin }, null, 2) + '\n');
  return { version, server: origin, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const result = await preparePages({ root, output: path.join(root, 'pages-dist'), server: process.env.SERVER_URL, commit: process.env.GITHUB_SHA || '' });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
