import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { serverOrigin, preparePages } from '../tools/prepare-pages.mjs';

test('서버 주소가 비거나 유효하지 않으면 연결 안 된 사이트의 배포를 막는다', () => {
  for (const value of ['', '   ', 'wrong', 'http://example.com', 'https://localhost', 'https://example.com/path', 'https://user:password@example.com', 'https://example.com/?token=secret']) assert.throws(() => serverOrigin(value));
  assert.equal(serverOrigin(' https://quiz.example.com/ '), 'https://quiz.example.com');
});

test('Pages 루트에 앱을 배치하고 원본 설정과 개발용 화면은 배포에서 분리한다', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'joyful-deploy-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public', 'dev'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.6.0' }));
  await fs.writeFile(path.join(root, 'public', 'teacher.html'), '<h1>교사</h1>');
  await fs.writeFile(path.join(root, 'public', 'config.js'), "window.JQ_CONFIG={server:''};");
  await fs.writeFile(path.join(root, 'public', 'dev', 'test.html'), 'development only');
  const output = path.join(root, 'dist');
  await preparePages({ root, output, server: 'https://quiz.example.com', commit: 'test-commit' });
  assert.match(await fs.readFile(path.join(output, 'teacher.html'), 'utf8'), /교사/);
  assert.match(await fs.readFile(path.join(output, 'config.js'), 'utf8'), /https:\/\/quiz.example.com/);
  assert.match(await fs.readFile(path.join(root, 'public', 'config.js'), 'utf8'), /server:''/);
  await assert.rejects(fs.stat(path.join(output, 'dev')), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'version.json'), 'utf8')), { version: '0.6.0', commit: 'test-commit', server: 'https://quiz.example.com' });
  await assert.rejects(preparePages({ root, output, server: 'https://quiz.example.com' }), { code: 'EEXIST' });
});
