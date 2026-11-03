// Configuração do condomínio e cálculo das parcelas (mesma regra do app no navegador)
import { ler, gravar } from './db.js';
import { individual } from './modo.js';

const anos = () => [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];
export function configPadrao() {
  const unidades = [];
  // piso de baixo: Apto 1 a 6; piso de cima: Apto 11 a 16 (o código interno a7..a12 não muda, para não perder dados)
  for (let i = 1; i <= 12; i++) { const n = i <= 6 ? i : i + 4; unidades.push({ id: 'a' + i, num: n, nome: 'Apto ' + n, tipo: 'apto', piso: i <= 6 ? 'Piso de baixo' : 'Piso de cima', whats: '' }); }
  for (let i = 1; i <= 7; i++) unidades.push({ id: 'k' + i, nome: 'Kitnet ' + i, tipo: i <= 3 ? 'kf' : 'kc', piso: i <= 3 ? 'Frente (baixo)' : 'Piso de cima', whats: '' });
  return {
    v: 2,
    cond: { nome: 'Condomínio Pousada Lua Sol e Mar', curto: 'Lua Sol e Mar', cidade: 'Itanhaém - SP', endereco: 'R. Cap. Afonso Tessitore, 30 - Balneário Jequitibá, Itanhaém - SP', praia: 'Pé na areia, na Av. Beira Mar', comarca: 'Itanhaém/SP' },
    pix: { chave: '6db85c96-885f-483c-9407-ec404ae9a18e', nome: 'CLALBO MARTINS', cidade: 'SAO PAULO' },
    dono: { nome: 'Proprietário', whats: '15991448112' },
    planos: {
      apto: { nome: 'Apartamento', contrato: 288000, entrada: 17000, inter: 17000, interAnos: anos(), mensal: 1350, mensalQtd: 100, condo: 200, condoReajustes: [] },
      kc: { nome: 'Kitnet de cima', contrato: 179000, entrada: 11000, inter: 11000, interAnos: anos(), mensal: 800, mensalQtd: 100, condo: 200, condoReajustes: [] },
      kf: { nome: 'Kitnet de frente', contrato: 254000, entrada: 12000, inter: 12000, interAnos: anos(), mensal: 1100, mensalQtd: 100, condo: 200, condoReajustes: [] },
    },
    datas: { entrada: '2026-11-10', mensal1: '2026-12', condo1: '2026-12', dia: 10, interMes: 12, interDia: 10 },
    unidades: individual() ? [{ id: 'u4', num: 4, nome: 'Apto 4', apelido: 'Maya', tipo: 'apto', piso: 'Piso de baixo', whats: '' }] : unidades,
    extras: [],
    // textos da capa do site
    site: individual()
      ? { marca: 'Apto 4 Maya', titulo: 'Apto 4', destaque: 'Maya', sub: 'Na Pousada Lua Sol e Mar, pé na areia na Av. Beira Mar, em Itanhaém. Até 5 pessoas, Wi-Fi grátis, piscina e estacionamento. Escolha as datas e reserve com sinal de 50% no Pix.' }
      : { marca: 'Lua Sol e Mar', titulo: 'Temporada de frente para o mar na', destaque: 'Lua Sol e Mar', sub: 'Apartamentos e kitnets na Av. Beira Mar. Escolha as datas, veja o que está livre e reserve com Pix. O contrato sai na hora, para assinar pelo celular.' },
    // anúncios que aparecem no popup da capa (acao: o que o toque no anúncio faz)
    popup: { ativo: true, segundos: 3.5 },
    anuncios: individual()
      ? [{ url: '/assets/anuncios/apartamentos.jpg', acao: 'datas' }, { url: '/assets/anuncios/reveillon.jpg', acao: 'pacote:Réveillon' }, { url: '/assets/anuncios/natal.jpg', acao: 'pacote:Natal' }]
      : [{ url: '/assets/anuncios/apartamentos.jpg', acao: 'tipo:apto' }, { url: '/assets/anuncios/kitnets.jpg', acao: 'tipo:kit' }, { url: '/assets/anuncios/reveillon.jpg', acao: 'pacote:Réveillon' }, { url: '/assets/anuncios/natal.jpg', acao: 'pacote:Natal' }],
    streetview: '',
    prazoPreHoras: 12,
    assinatura: 'autentique',
  };
}
export async function lerConfig() {
  const c = await ler('config');
  if (!c) return configPadrao();
  const p = configPadrao();
  const cfg = { ...p, ...c, cond: { ...p.cond, ...(c.cond || {}) } };
  // numeração nova do piso de cima (antes Apto 7 a 12, agora Apto 11 a 16)
  for (const u of cfg.unidades) if (u.id[0] === 'a' && u.num === undefined) {
    const i = Number(u.id.slice(1)), n = i <= 6 ? i : i + 4;
    u.num = n;
    if (u.nome === 'Apto ' + i) u.nome = 'Apto ' + n;
  }
  return cfg;
}
export const salvarConfig = (c) => gravar('config', c);
export async function dadosUnidade(uid) {
  const d = (await ler('unid:' + uid)) || { pag: {}, ajuste: {}, avisos: {} };
  // versão antiga guardava o condomínio como C001, C002...; agora é pelo mês (C2026-12)
  const velha = (k) => /^C\d{3}$/.test(k);
  if ([...Object.keys(d.pag || {}), ...Object.keys(d.ajuste || {})].some(velha)) {
    const cfg = await lerConfig();
    for (const obj of [d.pag || {}, d.ajuste || {}]) for (const k of Object.keys(obj)) if (velha(k)) {
      obj['C' + addMes(cfg.datas.condo1, Number(k.slice(1)) - 1, 1).slice(0, 7)] = obj[k];
      delete obj[k];
    }
    await gravar('unid:' + uid, d);
  }
  return d;
}
export const salvarUnidade = (uid, d) => gravar('unid:' + uid, d);

export const unidadePorSlug = (cfg, s) => cfg.unidades.find((u) => slug(u) === s || u.id === s);
export const slug = (u) => (u.tipo === 'apto' ? 'apto-' : 'kitnet-') + (u.num ?? u.id.slice(1));

// ---------- datas ----------
const pad = (n, l = 2) => String(n).padStart(l, '0');
export function hojeBR() {
  const d = new Date(Date.now() - 3 * 3600e3); // horário de Brasília
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dias = (de, ate) => Math.round((utc(ate) - utc(de)) / 864e5);
export const fmtD = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesAno = (iso) => { const [y, m] = iso.split('-'); return `${MESES[+m - 1]}/${y}`; };
export function addMes(ym, n, dia) {
  let [y, m] = ym.split('-').map(Number); m = m - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  const ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(dia, ult))}`;
}
export const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- parcelas ----------
// condomínio: mensal e sem prazo final; reajuste vale a partir do mês escolhido
export function valorCondo(p, ym) {
  let v = Number(p.condo) || 0;
  for (const r of [...(p.condoReajustes || [])].sort((a, b) => a.desde.localeCompare(b.desde))) if (r.desde <= ym) v = Number(r.valor) || 0;
  return v;
}
export function mesesCondo(D, ate) {
  const out = [];
  for (let i = 0; i < 1200; i++) { const m = addMes(D.condo1, i, 1).slice(0, 7); if (m > ate) break; out.push(m); }
  return out;
}
// divide um valor em n partes em centavos, sem sobrar nem faltar
export function dividir(total, n) {
  const c = Math.round(Number(total) * 100), base = Math.floor(c / n), out = Array(n).fill(base);
  for (let i = 0; i < c - base * n; i++) out[i]++;
  return out.map((x) => x / 100);
}
export function itensDe(cfg, u, ud, { ateMes } = {}) {
  const p = cfg.planos[u.tipo], D = cfg.datas, aj = ud.ajuste || {}, out = [];
  const add = (it) => {
    const a = aj[it.k];
    if (a) { if (a.valor !== undefined && a.valor !== '' && a.valor !== null) it.valor = Number(a.valor); if (a.venc) it.venc = a.venc; }
    const r = ud.pag?.[it.k];
    it.st = r?.st === 'pago' ? 'pago' : r?.st === 'aguardando' ? 'aguardando' : (dias(hojeBR(), it.venc) < 0 ? 'vencido' : 'aberto');
    out.push(it);
  };
  if (Number(p.entrada) > 0) add({ k: 'E', g: 'E', titulo: 'Entrada', valor: Number(p.entrada), venc: D.entrada });
  for (let i = 1; i <= Number(p.mensalQtd); i++) add({ k: 'M' + pad(i, 3), g: 'M', titulo: `Mensalidade ${i}/${p.mensalQtd}`, valor: Number(p.mensal), venc: addMes(D.mensal1, i - 1, Number(D.dia)) });
  (p.interAnos || []).forEach((y, i) => add({ k: 'I' + y, g: 'I', titulo: `Intermediária ${i + 1}/${p.interAnos.length}`, valor: Number(p.inter), venc: `${y}-${pad(D.interMes)}-${pad(D.interDia)}` }));
  const ate = ateMes || addMes(hojeBR().slice(0, 7), 24, 1).slice(0, 7);
  for (const ym of mesesCondo(D, ate)) add({ k: 'C' + ym, g: 'C', titulo: `Condomínio ${mesAno(ym + '-01')}`, valor: valorCondo(p, ym), venc: addMes(ym, 0, Number(D.dia)) });
  // melhorias e extras (ex.: pintura), só nas unidades incluídas
  for (const x of cfg.extras || []) {
    const vu = x.unidades?.[u.id];
    if (vu === undefined) continue;
    const n = Math.max(1, Number(x.parcelas) || 1), dia = Number(String(x.venc1).slice(8, 10)) || 10;
    dividir(vu, n).forEach((v, i) => add({ k: `X${x.id}-${pad(i + 1)}`, g: 'X', titulo: n > 1 ? `${x.nome} ${i + 1}/${n}` : x.nome, valor: v, venc: i === 0 ? x.venc1 : addMes(x.venc1, i, dia) }));
  }
  return out;
}
export { MESES, MESES_L, mesAno };

export const CAPA_PADRAO = ['/assets/fotos/capa1.jpg', '/assets/fotos/capa2.jpg', '/assets/fotos/capa3.jpg'];
