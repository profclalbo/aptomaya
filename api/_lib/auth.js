// Senhas, códigos e tokens de acesso
import crypto from 'node:crypto';
import { ler, gravar } from './db.js';
import { Erro } from './http.js';

let _segredo = null;
// Segredo do app: variável APP_SECRET ou, se não existir, um segredo aleatório criado uma vez e guardado no banco
export async function segredo() {
  if (_segredo) return _segredo;
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) return (_segredo = process.env.APP_SECRET);
  let s = await ler('segredo');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); await gravar('segredo', s); }
  return (_segredo = s);
}

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(senha), sal, 32).toString('hex');
  return `${sal}:${h}`;
}
export function conferirSenha(senha, guardado) {
  if (!guardado || !String(guardado).includes(':')) return false;
  const [sal, h] = guardado.split(':');
  const t = crypto.scryptSync(String(senha), sal, 32);
  const g = Buffer.from(h, 'hex');
  return g.length === t.length && crypto.timingSafeEqual(g, t);
}
export function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const b64u = (b) => Buffer.from(b).toString('base64url');
export async function assinar(dados, segundos) {
  const corpo = b64u(JSON.stringify({ ...dados, exp: Date.now() + segundos * 1000 }));
  const sig = crypto.createHmac('sha256', await segredo()).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}
export async function verificar(token) {
  if (!token || !String(token).includes('.')) return null;
  const [corpo, sig] = String(token).split('.');
  const certo = crypto.createHmac('sha256', await segredo()).update(corpo).digest('base64url');
  if (!iguais(sig, certo)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}

export function tokenDe(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
export async function exigir(req, papeis) {
  const d = await verificar(tokenDe(req));
  if (!d || !papeis.includes(d.r)) throw new Erro('Sua sessão expirou. Entre de novo.', 401);
  return d;
}

export const codigo6 = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
export const aleatorio = (n = 20) => crypto.randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n);
