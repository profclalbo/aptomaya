// Rotas públicas: vitrine, página da unidade, reserva do hóspede
import { rota, enviar, lerCorpo, parametros, ipDe, Erro } from './_lib/http.js';
import { ler, dentroDoLimite, comTrava, gravar } from './_lib/db.js';
import { aleatorio, iguais, codigo6 } from './_lib/auth.js';
import { salvarPrivado, apagarArquivo, decodificar } from './_lib/arquivos.js';
import { lerConfig, unidadePorSlug, slug, hojeBR, dias } from './_lib/condo.js';
import {
  lerAnuncio, reservasDa, noitesOcupadas, calcularValores, noitesEntre, isoValida, idsReservas, salvarReserva,
  statusReal, historico, msg, COMODIDADES,
  TIPOS_DOC, normDoc, docCompleto,
  conferirPacote, pacotesAtivos,
} from './_lib/temporada.js';
import { carregar, visaoHospede, lerDono, foneDono, linkHospede, linkDono, adicionarVistoria, removerVistoria, registrarAceite, sha256 } from './_lib/reservas.js';
import { enviarWhats, papiLigada } from './_lib/whats.js';

export { CAPA_PADRAO } from './_lib/condo.js';
import { CAPA_PADRAO } from './_lib/condo.js';
import { MODO } from './_lib/modo.js';

function publicoDoAnuncio(cfg, u, a, capa) {
  return {
    slug: slug(u), nome: u.nome, tipo: u.tipo, tipoNome: cfg.planos[u.tipo]?.nome, piso: u.piso,
    titulo: a.titulo, capacidade: a.capacidade, quartos: a.quartos, camas: a.camas, banheiros: a.banheiros,
    diaria: a.diaria, diariaFds: a.diariaFds, limpeza: a.limpeza, caucao: a.caucao, minNoites: a.minNoites,
    comodidades: (a.comodidades || []).filter((k) => COMODIDADES[k]), especiais: a.especiais || [],
    // fotos próprias da unidade primeiro, depois as fotos comuns da pousada (capa do site)
    fotos: [...new Set([...(a.fotos || []), ...capa])], fotosProprias: !!a.fotos?.length,
    apelido: u.apelido || '', sinalPct: Number(a.sinalPct) || 100,
    pacotes: pacotesAtivos(a).map((p) => ({ id: p.id, nome: p.nome, ini: p.ini, fim: p.fim, checkin: p.checkin, checkout: p.checkout, casal: p.casal, acompanhante: p.acompanhante, limpeza: p.limpeza ?? a.limpeza, idadeMin: p.idadeMin })),
  };
}

const ID_ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const novoId = () => Array.from({ length: 6 }, () => ID_ALFA[Math.floor(Math.random() * ID_ALFA.length)]).join('');

// ---------- validações ----------
const so = (s) => String(s || '').replace(/\D/g, '');
export function cpfValido(c) {
  c = so(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    const d = ((s * 10) % 11) % 10;
    if (d !== Number(c[t])) return false;
  }
  return true;
}
const txt = (s, max = 200) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const idadeNa = (nasc, ref) => { let i = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4)); if (ref.slice(5) < nasc.slice(5)) i--; return i; };
const idade = (nasc) => idadeNa(nasc, hojeBR());

async function acharReserva(id, t) {
  const r = await carregar(id);
  if (!iguais(String(t || ''), r.token)) throw new Erro('Reserva não encontrada.', 404);
  return r;
}

export default rota(async (req, res) => {
  const q = parametros(req);
  const corpo = req.method === 'POST' ? await lerCorpo(req) : {};
  const acao = q.acao || corpo.acao;
  const cfg = await lerConfig();
  const capa = (await ler('capa')) || CAPA_PADRAO;

  if (acao === 'vitrine') {
    const lista = await Promise.all(cfg.unidades.map(async (u) => {
      const a = await lerAnuncio(u);
      if (!a.ativo) return null;
      return { ...publicoDoAnuncio(cfg, u, a, capa), ocupadas: await noitesOcupadas(u.id, a) };
    }));
    return enviar(res, 200, {
      cond: cfg.cond, streetview: cfg.streetview || '', capa, hoje: hojeBR(), papi: papiLigada(), modo: MODO, site: cfg.site,
      popup: { ...(cfg.popup || {}), itens: (cfg.anuncios || []).filter((x) => x.ativo !== false) },
      unidades: lista.filter(Boolean), comodidades: COMODIDADES,
    });
  }

  if (acao === 'unidade') {
    const u = unidadePorSlug(cfg, q.u);
    if (!u) throw new Erro('Unidade não encontrada.', 404);
    const a = await lerAnuncio(u);
    if (!a.ativo) throw new Erro('Esta unidade não está disponível para temporada no momento.', 404);
    return enviar(res, 200, {
      cond: cfg.cond, hoje: hojeBR(), prazoPreHoras: cfg.prazoPreHoras || 12, comodidades: COMODIDADES, modo: MODO, site: cfg.site,
      unidade: {
        ...publicoDoAnuncio(cfg, u, a, capa), descricao: a.descricao, regras: a.regras, requisitos: a.requisitos,
        cancelamento: a.cancelamento, checkin: a.checkin, checkout: a.checkout, ocupadas: await noitesOcupadas(u.id, a),
        // botão "Falar com o proprietário": WhatsApp do dono da unidade; sem ele, o do proprietário da pousada
        contato: (await lerDono(u.id)).whats || u.whats || cfg.dono?.whats || '',
      },
    });
  }

  if (acao === 'reservar') {
    if (!(await dentroDoLimite('reserva:' + ipDe(req), 8, 3600))) throw new Erro('Muitas reservas seguidas. Espere um pouco e tente de novo.', 429);
    const u = unidadePorSlug(cfg, corpo.u);
    if (!u) throw new Erro('Unidade não encontrada.', 404);
    const a = await lerAnuncio(u);
    if (!a.ativo) throw new Erro('Esta unidade não está disponível para temporada.');
    const { ci, co } = corpo;
    const hoje = hojeBR();
    if (!isoValida(ci) || !isoValida(co) || co <= ci) throw new Erro('Escolha as datas de entrada e saída.');
    if (ci < hoje) throw new Erro('A data de entrada já passou.');
    const n = dias(ci, co);
    const pacote = conferirPacote(a, ci, co);
    if (!pacote && n < (Number(a.minNoites) || 1)) throw new Erro(`Mínimo de ${a.minNoites} noites para esta unidade.`);
    if (n > 90) throw new Erro('Locação por temporada é de no máximo 90 dias (Lei 8.245/91, art. 48).');
    const hospedes = Math.round(Number(corpo.hospedes));
    if (!(hospedes >= 1 && hospedes <= Number(a.capacidade))) throw new Erro(`Esta unidade recebe até ${a.capacidade} hóspedes.`);
    const T = corpo.titular || {};
    const titular = {
      nome: txt(T.nome, 120), cpf: txt(T.cpf, 20), rg: txt(T.rg, 30), nascimento: txt(T.nascimento, 10), nacionalidade: txt(T.nacionalidade, 40),
      estadoCivil: txt(T.estadoCivil, 30), profissao: txt(T.profissao, 60), endereco: txt(T.endereco, 220), email: txt(T.email, 120), whats: txt(T.whats, 20),
    };
    if (titular.nome.split(/\s+/).length < 2) throw new Erro('Informe o nome completo do titular.');
    if (!cpfValido(titular.cpf)) throw new Erro('CPF do titular inválido.');
    if (!titular.rg) throw new Erro('Informe o RG do titular.');
    if (!isoValida(titular.nascimento) || idade(titular.nascimento) < 18) throw new Erro('O titular da reserva precisa ter 18 anos ou mais.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(titular.email)) throw new Erro('E-mail do titular inválido.');
    if (![10, 11, 12, 13].includes(so(titular.whats).length)) throw new Erro('WhatsApp do titular inválido.');
    for (const k of ['endereco', 'nacionalidade', 'estadoCivil', 'profissao']) if (!titular[k]) throw new Erro('Preencha todos os dados do titular.');
    const acompanhantes = (Array.isArray(corpo.acompanhantes) ? corpo.acompanhantes : []).slice(0, hospedes - 1).map((x) => {
      const tipoDoc = TIPOS_DOC.includes(x?.tipoDoc) ? x.tipoDoc : '';
      const numero = txt(x?.numero, 40);
      return { nome: txt(x?.nome, 120), tipoDoc, numero, documento: tipoDoc && numero ? `${tipoDoc} ${numero}` : txt(x?.documento, 60), nascimento: txt(x?.nascimento, 10) };
    });
    if (acompanhantes.length !== hospedes - 1) throw new Erro('Preencha os dados de todos os hóspedes.');
    for (const x of acompanhantes) if (!x.nome || !isoValida(x.nascimento)) throw new Erro('Preencha o nome e a data de nascimento de cada hóspede.');
    if (!corpo.aceite) throw new Erro('É preciso aceitar as regras, os requisitos e a política de cancelamento.');

    // pagantes do pacote: titular + quem tem a idade mínima na data de entrada (crianças menores não pagam)
    const idadeMin = Number(pacote?.idadeMin) || 6;
    const pagantes = 1 + acompanhantes.filter((x) => idadeNa(x.nascimento, ci) >= idadeMin).length;
    const dono = await lerDono(u.id);
    const pixDono = dono.pix?.chave ? dono.pix : null;
    const r = await comTrava('unidade:' + u.id, async () => {
      const ocupadas = new Set(await noitesOcupadas(u.id, a));
      if (noitesEntre(ci, co).some((d) => ocupadas.has(d))) throw new Erro('Essas datas acabaram de ser reservadas. Escolha outras.', 409);
      const horas = Number(cfg.prazoPreHoras) || 12;
      let id; do { id = novoId(); } while (await ler('reserva:' + id));
      const r = {
        id, token: aleatorio(24), uid: u.id, criadoEm: new Date().toISOString(), expiraEm: new Date(Date.now() + horas * 3600e3).toISOString(),
        ci, co, hospedes, pagantes, valores: calcularValores(a, ci, co, { pagantes }), checkin: pacote?.checkin || a.checkin, checkout: pacote?.checkout || a.checkout,
        titular, acompanhantes, docs: Array(hospedes).fill(null),
        pix: pixDono || cfg.pix, pixDoAdmin: !pixDono, txid: 'LSM' + id, status: 'pre', historico: [],
      };
      historico(r, 'Pré-reserva criada pelo hóspede');
      await salvarReserva(r);
      const ids = await idsReservas(u.id); ids.push(id); await gravar('reservas:' + u.id, ids);
      return r;
    });
    let avisos = {};
    if (papiLigada()) {
      const horas = Number(cfg.prazoPreHoras) || 12;
      const fone = await foneDono(cfg, u, dono);
      if (fone) avisos.dono = (await enviarWhats(fone, msg.novaParaDono(r, u, linkDono(req, r)))).ok;
      avisos.hospede = (await enviarWhats(r.titular.whats, msg.novaParaHospede(r, u, cfg, linkHospede(req, r), horas))).ok;
    }
    return enviar(res, 200, { id: r.id, token: r.token, avisos });
  }

  if (acao === 'reserva') {
    const r = await acharReserva(q.id, q.t);
    const u = cfg.unidades.find((x) => x.id === r.uid);
    return enviar(res, 200, { reserva: await visaoHospede(r, cfg, u, await lerAnuncio(u)), papi: papiLigada() });
  }

  if (acao === 'doc') {
    const r = await acharReserva(corpo.id, corpo.t);
    if (!(await dentroDoLimite('docs:' + r.id, 60, 86400))) throw new Erro('Limite de envios atingido para esta reserva.', 429);
    if (['cancelada', 'expirada'].includes(statusReal(r))) throw new Erro('Esta reserva não está mais ativa.');
    const i = Math.round(Number(corpo.idx));
    if (!(i >= 0 && i < r.hospedes)) throw new Erro('Hóspede inválido.');
    const arq = decodificar(corpo.dados, corpo.tipo);
    if (arq.erro) throw new Erro(arq.erro);
    const lado = ['verso', 'inteiro'].includes(corpo.lado) ? corpo.lado : 'frente';
    const atual = normDoc(r.docs[i]) || {};
    // documento completo substitui frente e verso, e vice-versa
    const sobra = lado === 'inteiro' ? ['frente', 'verso'] : ['inteiro'];
    for (const l of sobra) if (atual[l]) { await apagarArquivo(atual[l].key); delete atual[l]; }
    const tipoDoc = TIPOS_DOC.includes(corpo.tipoDoc) ? corpo.tipoDoc : (atual.tipoDoc || 'RG');
    if (atual.tipoDoc && atual.tipoDoc !== tipoDoc && lado === 'frente' && atual.verso) { await apagarArquivo(atual.verso.key); delete atual.verso; }
    const antigo = atual[lado]?.key;
    const key = await salvarPrivado(`priv/${r.uid}/reservas/${r.id}/doc-${i + 1}-${lado}`, arq.buf);
    atual[lado] = { key, tipo: arq.tipo, nome: txt(corpo.nome, 80) || `documento-${i + 1}-${lado}.${arq.ext}`, em: new Date().toISOString() };
    atual.tipoDoc = tipoDoc;
    r.docs[i] = atual;
    await salvarReserva(r);
    if (antigo) await apagarArquivo(antigo);
    return enviar(res, 200, { ok: true, completo: docCompleto(atual) });
  }

  if (acao === 'vistoria' || acao === 'removerVistoria') {
    const r = await acharReserva(corpo.id, corpo.t);
    if (acao === 'vistoria') {
      if (!(await dentroDoLimite('vistoria:' + r.id, 120, 86400))) throw new Erro('Limite de envios atingido para esta reserva.', 429);
      await adicionarVistoria(r, corpo, 'hospede');
    } else await removerVistoria(r, corpo.idx, 'hospede');
    await salvarReserva(r);
    return enviar(res, 200, { ok: true });
  }

  if (acao === 'paguei') {
    const r = await acharReserva(corpo.id, corpo.t);
    const st = statusReal(r);
    if (st === 'expirada') throw new Erro('O prazo da pré-reserva acabou. Faça uma nova reserva.');
    if (st !== 'pre') return enviar(res, 200, { ok: true });
    r.status = 'pago_informado'; r.pagoInformadoEm = new Date().toISOString(); r.expiraEm = null;
    historico(r, 'Hóspede informou o pagamento do Pix');
    await salvarReserva(r);
    let avisado = false;
    const u = cfg.unidades.find((x) => x.id === r.uid);
    const fone = await foneDono(cfg, u);
    if (papiLigada() && fone) avisado = (await enviarWhats(fone, msg.pagoParaDono(r, u, linkDono(req, r)))).ok;
    return enviar(res, 200, { ok: true, avisado, mensagem: msg.pagoParaDono(r, u, linkDono(req, r)), fone });
  }

  // aceite eletrônico do contrato: código de 6 números no WhatsApp do titular
  if (acao === 'aceiteCodigo') {
    const r = await acharReserva(corpo.id, corpo.t);
    if (r.contrato?.metodo !== 'aceite' || !r.contrato?.key) throw new Erro('Este contrato não é assinado por código.');
    if (!['confirmada', 'assinatura'].includes(statusReal(r))) throw new Erro('Este contrato não está aguardando aceite.');
    if (r.contrato.aceite?.locatario) return enviar(res, 200, { ok: true, ja: true });
    if (!papiLigada()) throw new Erro('O envio de código pelo WhatsApp não está ligado. Fale com o proprietário.');
    if (!(await dentroDoLimite('aceite:' + r.id, 5, 3600))) throw new Erro('Muitos códigos pedidos. Tente de novo daqui a uma hora.', 429);
    const cod = codigo6();
    r.contrato.aceite = { ...(r.contrato.aceite || {}), codigo: { h: sha256(r.token + cod), exp: Date.now() + 10 * 60e3, tentativas: 0 } };
    await salvarReserva(r);
    const ok = (await enviarWhats(r.titular.whats, `🔐 Código para aceitar o contrato da reserva ${r.id}: *${cod}*

Vale por 10 minutos. Não passe este código para ninguém.`)).ok;
    if (!ok) throw new Erro('Não foi possível enviar o código pelo WhatsApp agora. Tente de novo em instantes.');
    return enviar(res, 200, { ok: true, final: String(r.titular.whats).replace(/\D/g, '').slice(-4) });
  }
  if (acao === 'aceiteConfirmar') {
    const r = await acharReserva(corpo.id, corpo.t);
    const cc = r.contrato?.aceite?.codigo;
    if (!cc || Date.now() > cc.exp) throw new Erro('O código venceu ou não foi pedido. Peça um novo.');
    if (cc.tentativas >= 5) throw new Erro('Muitas tentativas erradas. Peça um novo código.');
    if (!iguais(sha256(r.token + String(corpo.codigo || '').replace(/\D/g, '')), cc.h)) { cc.tentativas++; await salvarReserva(r); throw new Erro('Código incorreto.'); }
    delete r.contrato.aceite.codigo;
    await registrarAceite(req, r, 'locatario', { nome: r.titular.nome, cpf: r.titular.cpf, whats: r.titular.whats, canal: 'código de uso único enviado ao WhatsApp' });
    await salvarReserva(r);
    const u = cfg.unidades.find((x) => x.id === r.uid);
    const fone = await foneDono(cfg, u);
    if (papiLigada() && fone && r.status !== 'assinado') await enviarWhats(fone, `✍️ ${r.titular.nome} aceitou o contrato da reserva ${r.id} (${u.nome}) com o código do WhatsApp.

Falta o seu aceite:
${linkDono(req, r)}`);
    return enviar(res, 200, { ok: true, assinado: r.status === 'assinado' });
  }

  if (acao === 'pagueiRestante') {
    const r = await acharReserva(corpo.id, corpo.t);
    if (!['confirmada', 'assinatura', 'assinado'].includes(statusReal(r))) throw new Erro('O restante é pago depois que a reserva for confirmada.');
    if (!(r.valores.restante > 0) || r.restante?.recebidoEm) return enviar(res, 200, { ok: true });
    r.restante = { ...(r.restante || {}), informadoEm: new Date().toISOString() };
    historico(r, 'Hóspede informou o Pix do restante');
    await salvarReserva(r);
    const u = cfg.unidades.find((x) => x.id === r.uid);
    const fone = await foneDono(cfg, u);
    let avisado = false;
    if (papiLigada() && fone) avisado = (await enviarWhats(fone, msg.restanteParaDono(r, u, linkDono(req, r)))).ok;
    return enviar(res, 200, { ok: true, avisado, mensagem: msg.restanteParaDono(r, u, linkDono(req, r)), fone });
  }

  if (acao === 'govbr') {
    const r = await acharReserva(corpo.id, corpo.t);
    if (!r.contrato?.key) throw new Erro('O contrato ainda não foi gerado.');
    const arq = decodificar(corpo.dados, 'application/pdf', 4);
    if (arq.erro || arq.tipo !== 'application/pdf') throw new Erro('Envie o PDF assinado.');
    const key = await salvarPrivado(`priv/${r.uid}/contratos/${r.id}-inquilino`, arq.buf);
    const antigo = r.contrato.govbr?.inquilinoKey;
    r.contrato.metodo = 'govbr';
    r.contrato.govbr = { ...(r.contrato.govbr || {}), inquilinoKey: key, inquilinoEm: new Date().toISOString() };
    if (r.status === 'confirmada') r.status = 'assinatura';
    historico(r, 'Hóspede enviou o contrato assinado pelo gov.br');
    await salvarReserva(r);
    if (antigo) await apagarArquivo(antigo);
    const u = cfg.unidades.find((x) => x.id === r.uid);
    const fone = await foneDono(cfg, u);
    if (papiLigada() && fone) await enviarWhats(fone, msg.contratoInquilinoParaDono(r, u, linkDono(req, r)));
    return enviar(res, 200, { ok: true });
  }

  if (acao === 'cancelar') {
    const r = await acharReserva(corpo.id, corpo.t);
    if (statusReal(r) !== 'pre') throw new Erro('Depois do Pix informado, o cancelamento é feito com o dono da unidade.');
    r.status = 'cancelada'; r.canceladaEm = new Date().toISOString();
    historico(r, 'Pré-reserva cancelada pelo hóspede');
    await salvarReserva(r);
    return enviar(res, 200, { ok: true });
  }

  throw new Erro('Ação inválida.', 404);
});
// usado nos testes
export const _teste = { reservasDa };
