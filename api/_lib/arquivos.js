// Arquivos: fotos (públicas) e documentos/contratos (privados, criptografados antes de salvar).
// Na Vercel usa o Vercel Blob; no teste local grava numa pasta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { segredo } from './auth.js';

export const temBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const PASTA_LOCAL = process.env.LSM_ARQ_LOCAL || path.join(process.env.TMPDIR || '/tmp', 'lsm-arquivos');

async function blob() { return await import('@vercel/blob'); }

async function chaveCripto() {
  return crypto.createHash('sha256').update('arquivos:' + (await segredo())).digest();
}
async function cifrar(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', await chaveCripto(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('LSM1'), iv, c.getAuthTag(), enc]);
}
async function decifrar(buf) {
  if (buf.subarray(0, 4).toString() !== 'LSM1') throw new Error('arquivo inválido');
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), enc = buf.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', await chaveCripto(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}

const sufixo = () => crypto.randomBytes(9).toString('base64url');
const limparNome = (s) => String(s).replace(/[^a-zA-Z0-9/_.-]/g, '');

// foto pública (anúncios e capa) -> devolve a URL
export async function salvarPublico(caminho, buf, tipo) {
  caminho = limparNome(caminho);
  if (temBlob()) {
    const { put } = await blob();
    const r = await put(caminho, buf, { access: 'public', contentType: tipo, addRandomSuffix: true });
    return r.url;
  }
  if (process.env.VERCEL) throw new Error('Armazenamento de arquivos não configurado: conecte o Vercel Blob.');
  const nome = caminho.replace(/(\.[a-z0-9]+)$/i, `-${sufixo()}$1`);
  fs.mkdirSync(path.dirname(path.join(PASTA_LOCAL, 'pub', nome)), { recursive: true });
  fs.writeFileSync(path.join(PASTA_LOCAL, 'pub', nome), buf);
  return '/api/arquivo?pub=' + encodeURIComponent(nome);
}

// documento privado -> devolve a "chave" para buscar depois
export async function salvarPrivado(caminho, buf) {
  caminho = limparNome(caminho) + '.bin';
  const enc = await cifrar(buf);
  if (temBlob()) {
    const { put } = await blob();
    const r = await put('priv/' + caminho, enc, { access: 'public', contentType: 'application/octet-stream', addRandomSuffix: true });
    return r.url;
  }
  if (process.env.VERCEL) throw new Error('Armazenamento de arquivos não configurado: conecte o Vercel Blob.');
  const nome = caminho.replace(/\.bin$/, `-${sufixo()}.bin`);
  fs.mkdirSync(path.dirname(path.join(PASTA_LOCAL, 'priv', nome)), { recursive: true });
  fs.writeFileSync(path.join(PASTA_LOCAL, 'priv', nome), enc);
  return 'local:' + nome;
}

export async function lerPrivado(chave) {
  let buf;
  if (String(chave).startsWith('local:')) buf = fs.readFileSync(path.join(PASTA_LOCAL, 'priv', limparNome(chave.slice(6))));
  else {
    const r = await fetch(chave);
    if (!r.ok) throw new Error('arquivo não encontrado');
    buf = Buffer.from(await r.arrayBuffer());
  }
  return decifrar(buf);
}

export function lerPublicoLocal(nome) {
  return fs.readFileSync(path.join(PASTA_LOCAL, 'pub', limparNome(nome)));
}

export async function apagarArquivo(urlOuChave) {
  try {
    if (!urlOuChave) return;
    if (String(urlOuChave).startsWith('local:')) fs.rmSync(path.join(PASTA_LOCAL, 'priv', limparNome(urlOuChave.slice(6))), { force: true });
    else if (String(urlOuChave).startsWith('/api/arquivo?pub=')) fs.rmSync(path.join(PASTA_LOCAL, 'pub', limparNome(decodeURIComponent(urlOuChave.split('=')[1]))), { force: true });
    else if (temBlob()) { const { del } = await blob(); await del(urlOuChave); }
  } catch (e) { console.error('apagar arquivo', e.message); }
}

// arquivo enviado pelo navegador em base64 -> Buffer, conferindo tipo e tamanho
const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export function decodificar(dataUrlOuB64, tipo, maxMB = 3.2) {
  let b64 = String(dataUrlOuB64 || '');
  const m = b64.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) { tipo = m[1]; b64 = m[2]; }
  if (!TIPOS[tipo]) return { erro: 'Envie uma foto (JPG, PNG) ou um PDF.' };
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return { erro: 'Arquivo vazio.' };
  if (buf.length > maxMB * 1024 * 1024) return { erro: `Arquivo muito grande (máximo ${maxMB.toString().replace('.', ',')} MB).` };
  // confere a "assinatura" do arquivo
  const ini = buf.subarray(0, 5).toString('latin1');
  const ok = (tipo === 'application/pdf' && ini.startsWith('%PDF')) || (tipo === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
    || (tipo === 'image/png' && buf[1] === 0x50 && buf[2] === 0x4e) || (tipo === 'image/webp' && buf.subarray(8, 12).toString() === 'WEBP');
  if (!ok) return { erro: 'O arquivo não parece ser uma imagem ou PDF válido.' };
  return { buf, tipo, ext: TIPOS[tipo] };
}
