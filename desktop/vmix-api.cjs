const { URL } = require('node:url');
const { isIP } = require('node:net');

function validateVmixRequest(base, apiPath) {
  const url = new URL(base);
  const host = url.hostname.toLowerCase();
  const ipv4 = isIP(host) === 4 && /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  const local = host === 'localhost' || host === '[::1]' || host.endsWith('.local') || ipv4;
  if (!local || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('O acesso do HMD ao vMix exige um endereço da rede local.');
  }
  if (typeof apiPath !== 'string' || apiPath.length > 8192 || !/^\/api\/(?:\?[^#\r\n]*)?$/.test(apiPath)) {
    throw new Error('Caminho da API vMix inválido.');
  }
  return `${url.origin}${apiPath}`;
}

async function fetchVmixApi(base, apiPath, username = '', password = '', fetchImpl = fetch) {
  const target = validateVmixRequest(base, apiPath);
  const headers = { Accept: 'application/xml, text/xml, text/plain, */*' };
  if (username) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const response = await fetchImpl(target, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`vMix respondeu HTTP ${response.status}. Verifique o Web Controller e suas credenciais.`);
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error('Resposta do vMix excedeu o limite.');
  return body;
}

module.exports = { validateVmixRequest, fetchVmixApi };
