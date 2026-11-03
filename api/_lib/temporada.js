// Aluguel por temporada: anúncios, preços, disponibilidade e reservas
import { ler, gravar } from './db.js';
import { brl, fmtD, hojeBR } from './condo.js';
import { Erro } from './http.js';

export const COMODIDADES = {
  pe: 'Pé na areia', vista: 'Vista para o mar', wifi: 'Wi-Fi', ar: 'Ar-condicionado', ventilador: 'Ventilador',
  cozinha: 'Cozinha equipada', tv: 'TV', roupa: 'Roupa de cama e banho', garagem: 'Vaga de garagem',
  churrasqueira: 'Churrasqueira', piscina: 'Piscina', maquina: 'Máquina de lavar', varanda: 'Varanda', pet: 'Aceita pets',
};

// valores padrão da pousada (anúncios de novembro a março): até 5 pessoas, sinal de 50%
const BASE = {
  apto: { titulo: 'Apartamento pé na areia', capacidade: 5, quartos: 2, camas: 3, banheiros: 1, diaria: 300, diariaFds: 0, limpeza: 60, caucao: 0 },
  kc: { titulo: 'Kitnet no piso de cima', capacidade: 5, quartos: 1, camas: 2, banheiros: 1, diaria: 275, diariaFds: 0, limpeza: 60, caucao: 0 },
  kf: { titulo: 'Kitnet de frente para a praia', capacidade: 5, quartos: 1, camas: 2, banheiros: 1, diaria: 275, diariaFds: 0, limpeza: 60, caucao: 0 },
};
// pacotes fechados (só reserva o período inteiro): casal + acompanhante a partir de 6 anos; até 5 anos não paga
const pac = (id, nome, ini, fim, casal, acompanhante) => ({ id, nome, ini, fim, checkin: '17:00', checkout: '16:00', casal, acompanhante, idadeMin: 6, ativo: true });
const PACOTES = {
  apto: [pac('natal-2026', 'Natal', '2026-12-23', '2026-12-27', 2000, 500), pac('reveillon-2026', 'Réveillon', '2026-12-29', '2027-01-03', 3000, 600)],
  kit: [pac('natal-2026', 'Natal', '2026-12-23', '2026-12-27', 1800, 450), pac('reveillon-2026', 'Réveillon', '2026-12-29', '2027-01-03', 2700, 500)],
};
export function anuncioPadrao(u) {
  const b = BASE[u.tipo] || BASE.apto;
  return {
    exemplo: true, ativo: true, ...b,
    titulo: u.apelido ? `${u.nome} ${u.apelido} - pé na areia` : b.titulo,
    descricao: 'Unidade da Pousada Lua Sol e Mar, pé na areia na Av. Beira Mar, em Itanhaém (SP). Você sai de casa e já está na praia, com os quiosques da orla a poucos passos. Recebe até 5 pessoas, com Wi-Fi grátis, piscina e estacionamento. Ideal para descansar com a família e ver o pôr do sol de frente para o mar.',
    comodidades: ['pe', 'wifi', 'piscina', 'garagem', 'cozinha'],
    sinalPct: 50,
    pacotes: (u.tipo === 'apto' ? PACOTES.apto : PACOTES.kit).map((p) => ({ ...p })),
    regras: 'Check-in a partir das 17h e check-out até as 16h.\nSilêncio das 22h às 8h.\nProibido fumar dentro da unidade.\nNão são permitidas festas ou eventos.\nRespeite a capacidade máxima de hóspedes.',
    requisitos: 'Titular da reserva maior de 18 anos.\nDocumento com foto de todos os hóspedes (para crianças, certidão de nascimento ou RG).\nMenores de idade somente acompanhados dos pais ou responsáveis.',
    cancelamento: 'O sinal de 50% garante as datas e é descontado do total a pagar.\nO sinal não é devolvido em caso de cancelamento ou desistência do hóspede.\nO restante é pago no dia da entrada, antes da entrega das chaves.\nSe o cancelamento partir do proprietário, tudo o que foi pago é devolvido.',
    observacoesContrato: '',
    checkin: '17:00', checkout: '16:00', minNoites: 2,
    especiais: [], fotos: [], bloqueios: [],
  };
}
export async function lerAnuncio(u) {
  const a0 = await ler('anuncio:' + u.id);
  const a = a0 ? { ...anuncioPadrao(u), ...a0 } : anuncioPadrao(u);
  // horários antigos do padrão (14h/11h e pacotes até 15h) passam para entrada 17h e saída 16h
  if (a.checkin === '14:00' && a.checkout === '11:00') { a.checkin = '17:00'; a.checkout = '16:00'; }
  a.regras = String(a.regras || '').replace('Check-in a partir das 14h e check-out até as 11h.', 'Check-in a partir das 17h e check-out até as 16h.');
  // política antiga do padrão (reembolso por prazo) passa para a do sinal não reembolsável
  if (a.cancelamento === 'Até 30 dias antes do check-in: reembolso integral.\nDe 29 a 7 dias antes: reembolso de 50% das diárias.\nMenos de 7 dias: sem reembolso das diárias.\nA caução é sempre devolvida se a reserva for cancelada.') a.cancelamento = 'O sinal de 50% garante as datas e é descontado do total a pagar.\nO sinal não é devolvido em caso de cancelamento ou desistência do hóspede.\nO restante é pago no dia da entrada, antes da entrega das chaves.\nSe o cancelamento partir do proprietário, tudo o que foi pago é devolvido.';
  a.pacotes = (a.pacotes || []).map((p) => (p.checkin === '17:00' && p.checkout === '15:00' ? { ...p, checkout: '16:00' } : p));
  // a caução não é um valor à parte: é a reserva (sinal) em %, descontada do total
  a.caucao = 0;
  // datas especiais são vendidas como pacote, não por diária
  a.especiais = [];
  // no máximo 5 pessoas por unidade
  a.capacidade = Math.min(5, Math.max(1, Number(a.capacidade) || 5));
  return a;
}
export const salvarAnuncio = (uid, a) => gravar('anuncio:' + uid, a);

// ---------- datas ----------
const pad = (n) => String(n).padStart(2, '0');
export function somaDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const isoValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export function noitesEntre(ci, co) {
  const out = [];
  for (let d = ci; d < co && out.length < 400; d = somaDias(d, 1)) out.push(d);
  return out;
}
const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();

// preço de cada noite: período especial > fim de semana (sexta e sábado) > diária normal
export function precoNoite(a, d) {
  const esp = (a.especiais || []).find((e) => e.ini <= d && d <= e.fim && Number(e.diaria) > 0);
  if (esp) return Number(esp.diaria);
  const ds = diaSemana(d);
  if ((ds === 5 || ds === 6) && Number(a.diariaFds) > 0) return Number(a.diariaFds);
  return Number(a.diaria) || 0;
}
// ---------- pacotes fechados ----------
export const pacotesAtivos = (a) => (a.pacotes || []).filter((p) => p.ativo !== false && isoValida(p.ini) && isoValida(p.fim) && p.fim > p.ini);
// devolve o pacote quando o período é exatamente o do pacote; erro quando pega só parte dele
export function conferirPacote(a, ci, co) {
  const noites = noitesEntre(ci, co);
  const pks = pacotesAtivos(a).filter((p) => noites.some((d) => p.ini <= d && d < p.fim));
  if (!pks.length) return null;
  const p = pks[0];
  if (pks.length === 1 && ci === p.ini && co === p.fim) return p;
  throw new Erro(`De ${fmtD(p.ini)} a ${fmtD(p.fim)} só é possível reservar o pacote ${p.nome} completo.`);
}
const r2 = (v) => Math.round(v * 100) / 100;
// pagantes = pessoas a partir da idade mínima do pacote (o titular sempre conta)
export function calcularValores(a, ci, co, { pagantes } = {}) {
  const pk = pacotesAtivos(a).find((p) => p.ini === ci && p.fim === co);
  // nas datas especiais (pacotes) a limpeza pode ter valor próprio
  const limpeza = pk && pk.limpeza !== undefined && pk.limpeza !== null && pk.limpeza !== '' ? Number(pk.limpeza) || 0 : Number(a.limpeza) || 0;
  const caucao = Number(a.caucao) || 0;
  let base;
  if (pk) {
    const nAc = Math.max(0, (Math.max(1, Number(pagantes) || 2)) - 2);
    base = {
      pacote: { id: pk.id, nome: pk.nome, casal: Number(pk.casal) || 0, acompanhante: Number(pk.acompanhante) || 0, acompanhantes: nAc, idadeMin: Number(pk.idadeMin) || 6, checkin: pk.checkin, checkout: pk.checkout },
      diarias: [], noites: noitesEntre(ci, co).length, somaDiarias: r2((Number(pk.casal) || 0) + (Number(pk.acompanhante) || 0) * nAc),
    };
  } else {
    const diarias = noitesEntre(ci, co).map((d) => ({ data: d, valor: precoNoite(a, d) }));
    base = { diarias, noites: diarias.length, somaDiarias: r2(diarias.reduce((s, x) => s + x.valor, 0)) };
  }
  const total = r2(base.somaDiarias + limpeza + caucao);
  const sinalPct = Math.min(100, Math.max(1, Number(a.sinalPct) || 100));
  const sinal = sinalPct >= 100 ? total : r2(total * sinalPct / 100);
  return { ...base, limpeza, caucao, total, sinalPct, sinal, restante: r2(total - sinal) };
}

// ---------- reservas ----------
export const STATUS_BLOQUEIA = ['pre', 'pago_informado', 'confirmada', 'assinatura', 'assinado'];
export function statusReal(r) {
  if (r.status === 'pre' && r.expiraEm && Date.parse(r.expiraEm) < Date.now()) return 'expirada';
  return r.status;
}
export const NOME_STATUS = {
  pre: 'Pré-reserva (aguardando Pix)', pago_informado: 'Pix informado (aguardando confirmação)', confirmada: 'Confirmada',
  assinatura: 'Contrato em assinatura', assinado: 'Contrato assinado', cancelada: 'Cancelada', expirada: 'Pré-reserva expirada',
};
export const lerReserva = (id) => ler('reserva:' + id);
export const salvarReserva = (r) => gravar('reserva:' + r.id, r);
export async function idsReservas(uid) { return (await ler('reservas:' + uid)) || []; }
export async function reservasDa(uid) {
  const ids = await idsReservas(uid);
  const rs = await Promise.all(ids.map((id) => lerReserva(id)));
  return rs.filter(Boolean);
}
// noites ocupadas (bloqueios do dono + reservas ativas), só de hoje em diante
export async function noitesOcupadas(uid, anuncio, reservas) {
  const hoje = hojeBR();
  const set = new Set((anuncio.bloqueios || []).filter((d) => d >= hoje));
  for (const r of reservas || (await reservasDa(uid))) {
    if (!STATUS_BLOQUEIA.includes(statusReal(r))) continue;
    for (const d of noitesEntre(r.ci, r.co)) if (d >= hoje) set.add(d);
  }
  return [...set].sort();
}

// documentos dos hóspedes: frente e verso
export const TIPOS_DOC = ['RG', 'CNH', 'CPF', 'Certidão de nascimento', 'Passaporte', 'RNE/CRNM'];
export const precisaVerso = (tipoDoc, tipoArquivoFrente) => ['RG', 'CNH', 'CPF', 'RNE/CRNM'].includes(tipoDoc) && tipoArquivoFrente !== 'application/pdf';
// reservas antigas guardavam um arquivo só (vira a frente)
export const normDoc = (d) => (!d ? null : d.key ? { tipoDoc: 'Documento', frente: d } : d);
export function docCompleto(d) {
  d = normDoc(d);
  return !!(d?.inteiro || (d?.frente && (d.verso || !precisaVerso(d.tipoDoc, d.frente.tipo))));
}
export function resumoReserva(r) {
  return {
    id: r.id, uid: r.uid, ci: r.ci, co: r.co, noites: r.valores?.noites, hospedes: r.hospedes, total: r.valores?.total,
    titular: r.titular?.nome, whats: r.titular?.whats, status: statusReal(r), criadoEm: r.criadoEm,
    docsOk: (r.docs || []).filter(docCompleto).length, docsTotal: r.hospedes,
  };
}
export const historico = (r, txt) => { (r.historico = r.historico || []).push({ em: new Date().toISOString(), txt }); };

// ---------- mensagens de WhatsApp ----------
const periodo = (r) => `📅 ${fmtD(r.ci)} a ${fmtD(r.co)} (${r.valores.noites} noite${r.valores.noites > 1 ? 's' : ''})`;
const valorPix = (r) => { const v = r.valores; return v.sinal !== undefined && v.sinal < v.total ? `${brl(v.sinal)} de sinal (${v.sinalPct}% de ${brl(v.total)})` : brl(v.total); };
export const msg = {
  novaParaDono: (r, u, link) => `🏖️ *Nova pré-reserva*\n\n🏠 ${u.nome}\n👤 ${r.titular.nome}\n${periodo(r)}\n👥 ${r.hospedes} hóspede${r.hospedes > 1 ? 's' : ''}${r.valores.pacote ? `\n🎁 Pacote ${r.valores.pacote.nome}` : ''}\n💵 Total: ${brl(r.valores.total)}${r.valores.restante > 0 ? `\n💰 Sinal: ${brl(r.valores.sinal)} · restante na chegada: ${brl(r.valores.restante)}` : ''}\n\nAguardando o Pix do hóspede.\n📲 Painel: ${link}`,
  novaParaHospede: (r, u, cfg, link, horas) => `Olá, ${r.titular.nome.split(' ')[0]}! 👋\n\nRecebemos sua *pré-reserva* no ${cfg.cond.nome}.\n\n🏠 ${u.nome}\n${periodo(r)}${r.valores.pacote ? `\n🎁 Pacote ${r.valores.pacote.nome}` : ''}\n💵 Total: ${brl(r.valores.total)}${r.valores.restante > 0 ? `\n💰 Agora: sinal de ${brl(r.valores.sinal)} · na chegada: ${brl(r.valores.restante)}` : ''}\n\n⏳ As datas ficam guardadas por ${horas} horas. Pague o Pix${r.valores.restante > 0 ? ' do sinal' : ''} e toque em "Já paguei" na página da reserva:\n${link}`,
  pagoParaDono: (r, u, link) => `💰 *Pix informado pelo hóspede*\n\n🏠 ${u.nome}\n👤 ${r.titular.nome}\n${periodo(r)}\n💵 ${valorPix(r)}\n\nConfira no seu banco e confirme a reserva:\n${link}`,
  confirmadaParaHospede: (r, u, cfg, link) => `✅ *Reserva confirmada!*\n\n🏠 ${u.nome} - ${cfg.cond.nome}\n${periodo(r)}\n\n📄 O contrato de locação está pronto. Acompanhe e assine por aqui:\n${link}`,
  linkAssinatura: (nome, linkAss, papel) => `✍️ *Assinatura do contrato*\n\nOlá, ${String(nome).split(' ')[0]}! Seu contrato de locação por temporada está pronto para assinar como ${papel}.\n\nToque no link para ler e assinar:\n${linkAss}`,
  assinado: (r, u, link) => `🎉 *Contrato assinado por todos*\n\n🏠 ${u.nome}\n${periodo(r)}\n\nO PDF assinado está disponível em:\n${link}`,
  canceladaParaHospede: (r, u, motivo) => `Olá, ${r.titular.nome.split(' ')[0]}.\n\nSua reserva ${r.id} (${u.nome}, ${fmtD(r.ci)} a ${fmtD(r.co)}) foi *cancelada*.${motivo ? `\nMotivo: ${motivo}` : ''}\n\nQualquer dúvida, é só responder esta mensagem.`,
  restanteParaDono: (r, u, link) => `💰 *Restante pago pelo hóspede*\n\n🏠 ${u.nome}\n👤 ${r.titular.nome}\n${periodo(r)}\n💵 ${brl(r.valores.restante)}\n\nConfira no seu banco e marque como recebido:\n${link}`,
  contratoInquilinoParaDono: (r, u, link) => `✍️ *Contrato assinado pelo hóspede (gov.br)*\n\n🏠 ${u.nome} · ${r.titular.nome}\n\nBaixe o PDF, assine também pelo gov.br e envie no painel:\n${link}`,
};
