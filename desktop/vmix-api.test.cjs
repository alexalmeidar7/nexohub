const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVmixRequest, fetchVmixApi } = require('./vmix-api.cjs');

test('HMD relay accepts only local vMix API paths', () => {
  assert.equal(validateVmixRequest('http://192.168.1.10:8088', '/api/?Function=Cut&Input=2'), 'http://192.168.1.10:8088/api/?Function=Cut&Input=2');
  for (const base of ['https://example.com', 'file:///C:/Windows', 'http://user:pass@127.0.0.1:8088', 'http://192.168.evil.com', 'http://127.0.0.1.evil.com']) {
    assert.throws(() => validateVmixRequest(base, '/api/'));
  }
  for (const path of ['//example.com/api/', '/api/../../admin', '/api/other', '/api/?Function=Cut#ignored']) {
    assert.throws(() => validateVmixRequest('http://127.0.0.1:8088', path));
  }
});

test('a failed action is attempted once, without following redirects or retrying', async () => {
  let calls = 0;
  await assert.rejects(fetchVmixApi('http://127.0.0.1:8088', '/api/?Function=Cut', '', '', async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    throw new Error('Connection interrupted');
  }));
  assert.equal(calls, 1);
});

test('the native transport returns the real vMix response and checks HTTP failures', async () => {
  const xml = '<vmix><active>2</active></vmix>';
  assert.equal(await fetchVmixApi('http://localhost:8088', '/api/', '', '', async () => new Response(xml)), xml);
  await assert.rejects(fetchVmixApi('http://localhost:8088', '/api/', '', '', async () => new Response('Unauthorized', { status: 401 })), /401/);
});
