import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../scripts/server.js';
test('static server serves application and refuses private paths and writes', async t => {
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Rocket Jockey/i);
  for (const path of ['/.git/config', '/package.json', '/scripts/server.js', '/%2e%2e%5cREADME.md']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  const head = await fetch(base + '/src/app.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
