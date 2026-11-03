// Banco de dados: Upstash Redis pela API REST (variáveis criadas pela Vercel ao conectar o Upstash).
// Sem as variáveis (teste no computador), grava num arquivo local.
import fs from 'node:fs';
import path from 'node:path';
import { individual } from './modo.js';

const URL_REST = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN_REST = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const temRedis = () => !!(URL_REST && TOKEN_REST);

// "gaveta" do projeto dentro do banco: o site geral usa lsm: e o site individual usa maya:
// assim os dois projetos podem usar o mesmo Upstash sem misturar nada (BANCO_PREFIXO na Vercel troca, se precisar)
const PREFIXO = process.env.BANCO_PREFIXO || (individual() ? 'maya:' : 'lsm:');
const ARQ_LOCAL = process.env.LSM_DB_LOCAL || path.join(process.env.TMPDIR || '/tmp', 'lsm-db-local.json');

async function comando(args) {
  if (!temRedis()) return local(args);
  const r = await fetch(URL_REST, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_REST}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j.result;
}

// ---------- modo local (só para testes no computador) ----------
function lerLocal() { try { return JSON.parse(fs.readFileSync(ARQ_LOCAL, 'utf8')); } catch { return {}; } }
function gravarLocal(d) { fs.writeFileSync(ARQ_LOCAL, JSON.stringify(d)); }
function local([cmd, k, ...r]) {
  if (process.env.VERCEL) throw new Error('Banco não configurado: conecte o Upstash Redis no projeto da Vercel.');
  const d = lerLocal(); const agora = Date.now();
  for (const [kk, v] of Object.entries(d)) if (v && v.exp && v.exp < agora) delete d[kk];
  const C = cmd.toUpperCase();
  let out = null;
  if (C === 'GET') out = d[k]?.v ?? null;
  else if (C === 'SET') {
    const nx = r.includes('NX'); const ix = r.indexOf('EX');
    if (nx && d[k]) out = null;
    else { d[k] = { v: r[0], exp: ix >= 0 ? agora + Number(r[ix + 1]) * 1000 : 0 }; out = 'OK'; }
  } else if (C === 'DEL') { out = d[k] ? 1 : 0; delete d[k]; }
  else if (C === 'INCR') { const n = Number(d[k]?.v || 0) + 1; d[k] = { v: String(n), exp: d[k]?.exp || 0 }; out = n; }
  else if (C === 'EXPIRE') { if (d[k]) d[k].exp = agora + Number(r[0]) * 1000; out = 1; }
  gravarLocal(d);
  return out;
}

// ---------- API usada pelo app ----------
export async function ler(chave, padrao = null) {
  const v = await comando(['GET', PREFIXO + chave]);
  if (v === null || v === undefined) return padrao;
  try { return JSON.parse(v); } catch { return padrao; }
}
export async function gravar(chave, valor, segundos) {
  const args = ['SET', PREFIXO + chave, JSON.stringify(valor)];
  if (segundos) args.push('EX', String(segundos));
  await comando(args);
  return valor;
}
export async function apagar(chave) { await comando(['DEL', PREFIXO + chave]); }

// conta tentativas: devolve false quando passa do limite dentro da janela
export async function dentroDoLimite(chave, max, janelaSeg) {
  const k = PREFIXO + 'lim:' + chave;
  const n = await comando(['INCR', k]);
  if (Number(n) === 1) await comando(['EXPIRE', k, String(janelaSeg)]);
  return Number(n) <= max;
}

// trava simples para evitar duas reservas nas mesmas datas ao mesmo tempo
export async function comTrava(nome, fn) {
  const k = PREFIXO + 'trava:' + nome;
  for (let i = 0; i < 25; i++) {
    const ok = await comando(['SET', k, '1', 'NX', 'EX', '15']);
    if (ok === 'OK') {
      try { return await fn(); } finally { await comando(['DEL', k]); }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Sistema ocupado, tente de novo.');
}
