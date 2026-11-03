// Senhas do administrador e dos donos das unidades
import crypto from 'node:crypto';
import { ler, gravar, apagar, dentroDoLimite } from './db.js';
import { Erro } from './http.js';
import { hashSenha, conferirSenha, codigo6, iguais } from './auth.js';
import { enviarWhats, papiLigada } from './whats.js';

const SENHA_INICIAL = 'lua2026';
const fp = (s) => crypto.createHash('sha256').update('admin-env:' + s).digest('hex');

// ---------- administrador ----------
export async function dadosAdmin() {
  let a = await ler('admin');
  const env = process.env.ADMIN_SENHA;
  // se a variável ADMIN_SENHA da Vercel mudou, ela passa a valer (é o jeito de recuperar sem WhatsApp)
  if (env && (!a || a.envFp !== fp(env))) {
    a = { hash: hashSenha(env), envFp: fp(env), deveTrocar: false };
    await gravar('admin', a);
  }
  if (!a) { a = { hash: hashSenha(SENHA_INICIAL), envFp: null, deveTrocar: true }; await gravar('admin', a); }
  return a;
}
export async function loginAdmin(senha, ip) {
  if (!(await dentroDoLimite('login-admin:' + ip, 10, 900))) throw new Erro('Muitas tentativas. Espere 15 minutos.', 429);
  const a = await dadosAdmin();
  if (!conferirSenha(senha, a.hash)) throw new Erro('Senha incorreta.', 401);
  return a;
}
export async function trocarSenhaAdmin(nova) {
  if (String(nova || '').length < 6) throw new Erro('A senha precisa ter pelo menos 6 caracteres.');
  const a = await dadosAdmin();
  await gravar('admin', { ...a, hash: hashSenha(nova), deveTrocar: false });
}

// ---------- códigos por WhatsApp (recuperação) ----------
const mascara = (f) => { const d = String(f).replace(/\D/g, ''); return d.length >= 4 ? `(**) *****-${d.slice(-4)}` : '***'; };
export async function enviarCodigo(chave, fone, texto, ip) {
  if (!(await dentroDoLimite('codigo:' + chave + ':' + ip, 4, 3600))) throw new Erro('Muitos pedidos de código. Espere uma hora.', 429);
  if (!papiLigada() || !String(fone || '').replace(/\D/g, '')) return { enviado: false };
  const c = codigo6();
  await gravar('cod:' + chave, { c, tent: 0 }, 900);
  const r = await enviarWhats(fone, texto(c));
  return { enviado: r.ok, para: mascara(fone) };
}
export async function conferirCodigo(chave, codigo) {
  const k = 'cod:' + chave;
  const d = await ler(k);
  if (!d) return false;
  if (d.tent >= 5) { await apagar(k); return false; }
  if (!iguais(String(codigo || '').trim(), d.c)) { await gravar(k, { ...d, tent: d.tent + 1 }, 900); return false; }
  await apagar(k);
  return true;
}

// ---------- donos das unidades ----------
export const lerAcesso = async (uid) => (await ler('acesso:' + uid)) || {};
export async function novoConvite(uid) {
  const a = await lerAcesso(uid);
  const codigo = codigo6();
  await gravar('acesso:' + uid, { ...a, convite: { codigo, em: new Date().toISOString() } });
  return codigo;
}
export async function loginDono(uid, senha, ip) {
  if (!(await dentroDoLimite('login-dono:' + uid + ':' + ip, 10, 900))) throw new Erro('Muitas tentativas. Espere 15 minutos.', 429);
  const a = await lerAcesso(uid);
  if (!a.hash) throw new Erro('Esta unidade ainda não tem senha. Use "Primeiro acesso" com o código que o proprietário enviou.', 401);
  if (!conferirSenha(senha, a.hash)) throw new Erro('Senha incorreta.', 401);
}
// primeiro acesso ou redefinição: aceita o código de convite (7 dias) ou o código enviado por WhatsApp
export async function definirSenhaDono(uid, codigo, senha, ip) {
  if (!(await dentroDoLimite('def-dono:' + uid + ':' + ip, 10, 900))) throw new Erro('Muitas tentativas. Espere 15 minutos.', 429);
  if (String(senha || '').length < 6) throw new Erro('A senha precisa ter pelo menos 6 caracteres.');
  const a = await lerAcesso(uid);
  const conv = a.convite;
  const conviteOk = conv && Date.now() - Date.parse(conv.em) < 7 * 864e5 && iguais(String(codigo || '').trim(), conv.codigo);
  if (!conviteOk && !(await conferirCodigo('dono:' + uid, codigo))) throw new Erro('Código inválido ou vencido. Peça um novo ao proprietário.', 401);
  await gravar('acesso:' + uid, { hash: hashSenha(senha), definidaEm: new Date().toISOString() });
}
export async function trocarSenhaDono(uid, atual, nova) {
  const a = await lerAcesso(uid);
  if (!conferirSenha(atual, a.hash)) throw new Erro('Senha atual incorreta.');
  if (String(nova || '').length < 6) throw new Erro('A nova senha precisa ter pelo menos 6 caracteres.');
  await gravar('acesso:' + uid, { ...a, hash: hashSenha(nova) });
}
