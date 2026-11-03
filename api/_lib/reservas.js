// Operações das reservas usadas pelo hóspede, pelo dono da unidade e pelo administrador
import { ler, gravar } from './db.js';
import { Erro, ipDe } from './http.js';
import crypto from 'node:crypto';
import { assinar } from './auth.js';
import { salvarPrivado, apagarArquivo, decodificar, lerPrivado } from './arquivos.js';
import { lerConfig, slug } from './condo.js';
import { individual } from './modo.js';
import { lerAnuncio, lerReserva, salvarReserva, statusReal, historico, msg, NOME_STATUS, normDoc, docCompleto, precisaVerso } from './temporada.js';
import { gerarPdfContrato, anexarManifesto } from './contrato.js';
import { enviarWhats, papiLigada } from './whats.js';
import { autentiqueLigada, autentiqueTeste, criarDocumento, consultarDocumento, baixarAssinado } from './autentique.js';
const metodoPadrao = (cfg) => (cfg.assinatura === 'aceite' && papiLigada() ? 'aceite' : cfg.assinatura !== 'govbr' && autentiqueLigada() ? 'autentique' : 'govbr');

export const base = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') || String(host).startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
};
export const linkHospede = (req, r) => `${base(req)}/#/reserva/${r.id}/${r.token}`;
export const linkDono = (req, r) => (individual() ? `${base(req)}/app#/admin/reserva/${r.id}` : `${base(req)}/app#/dono/reserva/${r.id}`);

// no site individual os dados do proprietário (locador e Pix) valem para todas as unidades
export const chaveDono = (uid) => (individual() ? 'dados:geral' : 'dados:' + uid);
export const lerDono = async (uid) => (await ler(chaveDono(uid))) || {};
// WhatsApp de quem recebe os avisos da unidade (no individual, cai no WhatsApp do proprietário em Ajustes)
export const foneDono = async (cfg, u, dono) => (dono || (await lerDono(u.id))).whats || u.whats || (individual() ? cfg.dono?.whats : '') || '';
export const DONO_CAMPOS = ['nome', 'nacionalidade', 'estadoCivil', 'profissao', 'rg', 'cpf', 'endereco', 'email', 'whats'];
export function faltaNoDono(d) {
  const nomes = { nome: 'nome completo', cpf: 'CPF', rg: 'RG', endereco: 'endereço', nacionalidade: 'nacionalidade', estadoCivil: 'estado civil', profissao: 'profissão' };
  return Object.keys(nomes).filter((k) => !String(d[k] || '').trim()).map((k) => nomes[k]);
}

// link temporário (30 min) para abrir um arquivo privado
export async function linkArquivo(chave, nome, tipo) {
  if (!chave) return null;
  return '/api/arquivo?f=' + (await assinar({ k: chave, n: nome, ct: tipo }, 1800));
}

// links dos documentos (frente e verso) de cada hóspede
async function docsComLinks(r) {
  return Promise.all((r.docs || []).map(async (d0, i) => {
    const d = normDoc(d0);
    if (!d) return null;
    const lado = async (x, nome) => x ? { tipo: x.tipo, nome: x.nome, em: x.em, url: await linkArquivo(x.key, `hospede-${i + 1}-${nome}.${x.tipo === 'application/pdf' ? 'pdf' : 'jpg'}`, x.tipo) } : null;
    return { tipoDoc: d.tipoDoc, completo: docCompleto(d), precisaVerso: d.frente ? precisaVerso(d.tipoDoc, d.frente.tipo) : true, frente: await lado(d.frente, 'frente'), verso: await lado(d.verso, 'verso'), inteiro: await lado(d.inteiro, 'documento-completo') };
  }));
}
// fotos do imóvel (vistoria de entrada e saída)
async function vistoriaComLinks(r) {
  return Promise.all((r.vistoria || []).map(async (f, i) => ({ i, momento: f.momento, por: f.por, em: f.em, url: await linkArquivo(f.key, `vistoria-${r.id}-${i + 1}.jpg`, f.tipo) })));
}
export async function adicionarVistoria(r, corpo, por) {
  if (['cancelada', 'expirada'].includes(statusReal(r))) throw new Erro('Esta reserva não está mais ativa.');
  if ((r.vistoria || []).length >= 60) throw new Erro('Limite de 60 fotos por reserva.');
  const arq = decodificar(corpo.dados, corpo.tipo, 3.5);
  if (arq.erro || arq.tipo === 'application/pdf') throw new Erro(arq.erro || 'Envie uma foto.');
  const key = await salvarPrivado(`priv/${r.uid}/reservas/${r.id}/vistoria`, arq.buf);
  r.vistoria = [...(r.vistoria || []), { key, tipo: arq.tipo, momento: corpo.momento === 'saida' ? 'saida' : 'entrada', por, em: new Date().toISOString() }];
}
export async function removerVistoria(r, idx, por) {
  const f = (r.vistoria || [])[Number(idx)];
  if (!f) throw new Erro('Foto não encontrada.');
  if (f.por !== por) throw new Erro('Só quem enviou pode apagar esta foto.');
  r.vistoria.splice(Number(idx), 1);
  await apagarArquivo(f.key);
}

// visão completa (dono/admin)
export async function visaoCompleta(r) {
  const docs = await docsComLinks(r);
  const vistoria = await vistoriaComLinks(r);
  const c = r.contrato || {};
  return {
    ...r, token: undefined, docs, vistoria, status: statusReal(r), nomeStatus: NOME_STATUS[statusReal(r)],
    contrato: r.contrato ? {
      metodo: c.metodo, geradoEm: c.geradoEm,
      pdf: await linkArquivo(c.key, `contrato-${r.id}.pdf`, 'application/pdf'),
      inquilinoGovbr: await linkArquivo(c.govbr?.inquilinoKey, `contrato-${r.id}-assinado-inquilino.pdf`, 'application/pdf'),
      inquilinoGovbrEm: c.govbr?.inquilinoEm || null,
      final: await linkArquivo(c.finalKey, `contrato-${r.id}-assinado.pdf`, 'application/pdf'),
      finalEm: c.finalEm || null,
      autentique: c.autentique ? { id: c.autentique.id, teste: c.autentique.teste, links: c.autentique.links, assinados: c.autentique.assinados || {}, recusa: c.autentique.recusa || null } : null,
      aceite: c.metodo === 'aceite' ? { locador: c.aceite?.locador || null, locatario: c.aceite?.locatario || null } : null,
    } : null,
  };
}

// visão do hóspede (sem documentos de outras pessoas além dos dele mesmo e sem dados do dono)
export async function visaoHospede(r, cfg, u, anuncio) {
  const c = r.contrato || {};
  const dono = await lerDono(r.uid);
  const st = statusReal(r);
  return {
    id: r.id, status: st, nomeStatus: NOME_STATUS[st], criadoEm: r.criadoEm, expiraEm: r.expiraEm, pagoInformadoEm: r.pagoInformadoEm || null,
    unidade: { nome: u.nome, slug: slug(u), titulo: anuncio.titulo, foto: anuncio.fotos?.[0] || null },
    cond: { nome: cfg.cond.nome, endereco: cfg.cond.endereco },
    ci: r.ci, co: r.co, hospedes: r.hospedes, valores: r.valores, checkin: r.checkin || anuncio.checkin, checkout: r.checkout || anuncio.checkout,
    pix: st === 'pre' || st === 'pago_informado' ? r.pix : null, txid: r.txid,
    restante: { valor: r.valores.restante || 0, informadoEm: r.restante?.informadoEm || null, recebidoEm: r.restante?.recebidoEm || null },
    pixRestante: ['confirmada', 'assinatura', 'assinado'].includes(st) && r.valores.restante > 0 && !r.restante?.recebidoEm ? (dono.pix?.chave ? dono.pix : r.pix) : null,
    titular: { nome: r.titular.nome }, acompanhantes: (r.acompanhantes || []).map((a) => ({ nome: a.nome })),
    docs: (r.docs || []).map((d0) => { const d = normDoc(d0); return d ? { tipoDoc: d.tipoDoc, completo: docCompleto(d), precisaVerso: d.frente ? precisaVerso(d.tipoDoc, d.frente.tipo) : true, frente: !!d.frente, verso: !!d.verso, inteiro: !!d.inteiro } : null; }),
    vistoria: await vistoriaComLinks(r),
    whatsDono: await foneDono(cfg, u, dono),
    contrato: r.contrato ? {
      metodo: c.metodo,
      pdf: await linkArquivo(c.key, `contrato-${r.id}.pdf`, 'application/pdf'),
      final: await linkArquivo(c.finalKey, `contrato-${r.id}-assinado.pdf`, 'application/pdf'),
      inquilinoEnviou: !!c.govbr?.inquilinoKey,
      linkAssinatura: c.autentique?.links?.[1] || null,
      assinouInquilino: !!c.autentique?.assinados?.locatario,
      teste: !!c.autentique?.teste,
      aceite: c.metodo === 'aceite' ? { locatario: c.aceite?.locatario?.em || null, locador: c.aceite?.locador?.em || null, final: String(r.titular.whats || '').replace(/\D/g, '').slice(-4), papi: papiLigada() } : null,
    } : null,
  };
}

// gera (ou regera) o PDF do contrato
export async function gerarContrato(r) {
  const cfg = await lerConfig();
  const u = cfg.unidades.find((x) => x.id === r.uid);
  const anuncio = await lerAnuncio(u);
  const dono = await lerDono(r.uid);
  const falta = faltaNoDono(dono);
  if (falta.length) throw new Erro(`Antes de gerar o contrato, preencha em "Meus dados": ${falta.join(', ')}.`);
  const buf = await gerarPdfContrato({ cfg, u, anuncio, dono, r });
  const key = await salvarPrivado(`priv/${r.uid}/contratos/${r.id}`, buf);
  r.contrato = { ...(r.contrato || {}), key, geradoEm: new Date().toISOString(), metodo: r.contrato?.metodo || metodoPadrao(cfg) };
  delete r.contrato.aceite;   // contrato novo: os aceites anteriores não valem para ele
  return { buf, cfg, u, dono };
}

export async function enviarParaAutentique(req, r, { buf, u, dono } = {}) {
  if (!autentiqueLigada()) throw new Erro('A Autentique ainda não está ligada (falta a variável AUTENTIQUE_TOKEN na Vercel). Use a assinatura pelo gov.br.');
  if (!buf) ({ buf, u, dono } = await gerarContrato(r));
  const doc = await criarDocumento({
    nome: `Contrato de temporada ${u.nome} - ${r.id}`, buf,
    signatarios: [{ nome: dono.nome, cpf: dono.cpf }, { nome: r.titular.nome, cpf: r.titular.cpf }],
    mensagem: `Locação por temporada de ${r.ci} a ${r.co}.`,
  });
  r.contrato.metodo = 'autentique';
  r.contrato.autentique = { id: doc.id, links: doc.links, assinados: {}, teste: autentiqueTeste() };
  r.status = 'assinatura';
  await gravar('autdoc:' + doc.id, r.id);
  historico(r, 'Contrato enviado para assinatura na Autentique' + (autentiqueTeste() ? ' (modo de teste)' : ''));
  // manda os links pelo WhatsApp quando a PAPI está ligada
  if (papiLigada()) {
    if (doc.links[1] && r.titular.whats) await enviarWhats(r.titular.whats, msg.linkAssinatura(r.titular.nome, doc.links[1], 'locatário(a)'));
    if (doc.links[0] && dono.whats) await enviarWhats(dono.whats, msg.linkAssinatura(dono.nome, doc.links[0], 'locador(a)'));
  }
  return r;
}

// consulta a Autentique e, se todos assinaram, guarda o PDF assinado
export async function atualizarAutentique(req, r) {
  const a = r.contrato?.autentique;
  if (!a?.id) return r;
  const d = await consultarDocumento(a.id);
  if (!d) return r;
  const dono = await lerDono(r.uid);
  const achar = (nome) => d.signatures.find((s) => s.name && s.name.trim().toLowerCase() === String(nome || '').trim().toLowerCase());
  const sl = achar(dono.nome), st = achar(r.titular.nome);
  a.assinados = { locador: sl?.signed?.created_at || null, locatario: st?.signed?.created_at || null };
  const rec = [sl, st].find((s) => s?.rejected);
  a.recusa = rec ? { nome: rec.name, motivo: rec.rejected.reason || '' } : null;
  if (a.assinados.locador && a.assinados.locatario && !r.contrato.finalKey && d.files?.signed) {
    const buf = await baixarAssinado(d.files.signed);
    r.contrato.finalKey = await salvarPrivado(`priv/${r.uid}/contratos/${r.id}-assinado`, buf);
    r.contrato.finalEm = new Date().toISOString();
    r.status = 'assinado';
    historico(r, 'Contrato assinado por todos (Autentique)');
    const cfg = await lerConfig(); const u = cfg.unidades.find((x) => x.id === r.uid);
    if (papiLigada() && r.titular.whats) await enviarWhats(r.titular.whats, msg.assinado(r, u, linkHospede(req, r)));
    if (papiLigada() && dono.whats) await enviarWhats(dono.whats, msg.assinado(r, u, linkDono(req, r)));
  }
  return r;
}

export async function carregar(id) {
  const r = await lerReserva(String(id || ''));
  if (!r) throw new Erro('Reserva não encontrada.', 404);
  return r;
}
export { salvarReserva };

// ---------- aceite eletrônico por código ----------
export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export async function registrarAceite(req, r, quem, extra) {
  const c = r.contrato;
  if (!c?.key || c.metodo !== 'aceite') throw new Erro('Este contrato não está no aceite por código.');
  if (statusReal(r) === 'assinado') throw new Erro('O contrato já está assinado.');
  const buf = await lerPrivado(c.key);
  c.aceite = { ...(c.aceite || {}), [quem]: { em: new Date().toISOString(), ip: ipDe(req), aparelho: String(req.headers['user-agent'] || '').slice(0, 160), hash: sha256(buf), ...extra } };
  historico(r, quem === 'locatario' ? 'Hóspede aceitou o contrato com o código enviado ao WhatsApp' : 'Locador aceitou o contrato eletronicamente');
  if (c.aceite.locatario && c.aceite.locador) {
    const cfg = await lerConfig();
    const u = cfg.unidades.find((x) => x.id === r.uid);
    const final = await anexarManifesto(buf, { r, u, cfg, aceite: c.aceite, hash: sha256(buf) });
    if (c.finalKey) await apagarArquivo(c.finalKey);
    c.finalKey = await salvarPrivado(`priv/${r.uid}/contratos/${r.id}-final`, final);
    c.finalEm = new Date().toISOString();
    r.status = 'assinado';
    historico(r, 'Contrato assinado eletronicamente pelas duas partes (aceite por código)');
    if (papiLigada()) await enviarWhats(r.titular.whats, msg.assinado(r, u, linkHospede(req, r)));
  } else if (r.status === 'confirmada') r.status = 'assinatura';
}
