// Área do dono da unidade (parcelas, anúncio de temporada, reservas, dados). O administrador também usa estas rotas.
import { rota, enviar, lerCorpo, parametros, ipDe, Erro } from './_lib/http.js';
import { gravar } from './_lib/db.js';
import { assinar, exigir } from './_lib/auth.js';
import { salvarPublico, salvarPrivado, apagarArquivo, decodificar } from './_lib/arquivos.js';
import { lerConfig, salvarConfig, dadosUnidade, salvarUnidade, unidadePorSlug, itensDe, slug } from './_lib/condo.js';
import { lerAnuncio, salvarAnuncio, reservasDa, resumoReserva, statusReal, historico, msg, COMODIDADES, isoValida, noitesOcupadas } from './_lib/temporada.js';
import {
  carregar, salvarReserva, visaoCompleta, gerarContrato, enviarParaAutentique, atualizarAutentique, lerDono, registrarAceite,
  linkHospede, linkDono, DONO_CAMPOS, faltaNoDono, base,
  adicionarVistoria, removerVistoria,
  chaveDono,
} from './_lib/reservas.js';
import { loginDono, definirSenhaDono, trocarSenhaDono, enviarCodigo } from './_lib/acesso.js';
import { enviarWhats, papiLigada } from './_lib/whats.js';
import { autentiqueLigada, autentiqueTeste } from './_lib/autentique.js';
import { MODO, individual } from './_lib/modo.js';

const txt = (s, max = 300) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const num = (v, min = 0, max = 1e7) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };

function publicoUnidade(u) { return { id: u.id, slug: slug(u), nome: u.nome, tipo: u.tipo, piso: u.piso }; }

export default rota(async (req, res) => {
  const q = parametros(req);
  const corpo = req.method === 'POST' ? await lerCorpo(req) : {};
  const acao = q.acao || corpo.acao;
  const cfg = await lerConfig();
  const ip = ipDe(req);

  // ---------- rotas sem login ----------
  if (acao === 'unidades') return enviar(res, 200, { cond: cfg.cond, unidades: cfg.unidades.map(publicoUnidade), papi: papiLigada(), modo: MODO });
  if (acao === 'login' || acao === 'definir' || acao === 'esqueci') {
    const u = unidadePorSlug(cfg, corpo.u);
    if (!u) throw new Erro('Escolha a unidade.');
    if (acao === 'login') await loginDono(u.id, corpo.senha, ip);
    else if (acao === 'definir') {
      await definirSenhaDono(u.id, corpo.codigo, corpo.senha, ip);
      const fone = txt(corpo.whats, 20);
      if (fone) {
        const d = await lerDono(u.id); d.whats = fone; await gravar('dados:' + u.id, d);
        u.whats = fone; await salvarConfig(cfg);
      }
    } else {
      const fone = (await lerDono(u.id)).whats || u.whats;
      const r = await enviarCodigo('dono:' + u.id, fone, (c) => `🔐 Código para criar uma nova senha do ${u.nome} (${cfg.cond.curto}): *${c}*\n\nVale por 15 minutos. Se não foi você, ignore.`, ip);
      return enviar(res, 200, r.enviado ? { ok: true, mensagem: `Enviamos um código para o WhatsApp ${r.para}.` } : { ok: false, mensagem: 'Não há WhatsApp automático para esta unidade. Peça ao proprietário um novo código de acesso.' });
    }
    return enviar(res, 200, { token: await assinar({ r: 'dono', u: u.id }, 30 * 86400), unidade: publicoUnidade(u) });
  }

  // ---------- daqui para baixo precisa de login (dono da unidade ou administrador) ----------
  const sess = await exigir(req, ['dono', 'admin']);
  let u;
  if (sess.r === 'dono') u = cfg.unidades.find((x) => x.id === sess.u);
  else u = unidadePorSlug(cfg, q.u || corpo.u);
  if (!u) throw new Erro('Unidade não encontrada.', 404);
  const admin = sess.r === 'admin';
  const minhaReserva = async (id) => { const r = await carregar(id); if (r.uid !== u.id) throw new Erro('Reserva não encontrada.', 404); return r; };

  if (acao === 'painel') {
    const [ud, dados, anuncio, reservas] = await Promise.all([dadosUnidade(u.id), lerDono(u.id), lerAnuncio(u), reservasDa(u.id)]);
    return enviar(res, 200, {
      admin, modo: MODO, unidade: { ...u, slug: slug(u) },
      config: {
        cond: cfg.cond, planos: cfg.planos, datas: cfg.datas, pix: cfg.pix, dono: { nome: cfg.dono.nome, whats: cfg.dono.whats }, assinatura: cfg.assinatura,
        // só as cobranças extras desta unidade, com o valor desta unidade
        extras: (cfg.extras || []).filter((x) => x.unidades?.[u.id] !== undefined).map((x) => ({ ...x, unidades: { [u.id]: x.unidades[u.id] } })),
      },
      parcelas: ud, dados, anuncio, comodidades: COMODIDADES, faltaDados: faltaNoDono(dados),
      reservas: reservas.map(resumoReserva).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      ocupadas: await noitesOcupadas(u.id, anuncio, reservas),
      integracoes: { papi: papiLigada(), autentique: autentiqueLigada(), autentiqueTeste: autentiqueTeste() },
    });
  }

  // parcelas: "já paguei"
  if (acao === 'informar') {
    const ud = await dadosUnidade(u.id);
    const its = itensDe(cfg, u, ud).filter((i) => (corpo.keys || []).includes(i.k) && i.st !== 'pago' && i.st !== 'aguardando');
    if (!its.length) throw new Erro('Essas parcelas já foram informadas ou pagas.');
    const em = new Date().toISOString();
    for (const it of its) ud.pag[it.k] = { st: 'aguardando', inf: em, valor: it.valor, via: 'morador' };
    await salvarUnidade(u.id, ud);
    const tot = its.reduce((s, i) => s + i.valor, 0);
    const texto = `💰 *Pagamento informado*\n\n🏠 ${u.nome}\n\n${its.map((i) => `📄 ${i.titulo}\n📅 Vencimento: ${i.venc.split('-').reverse().join('/')}\n💵 ${i.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('\n\n')}\n\n*Total: ${tot.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n\n✔️ Confira no seu banco e dê baixa no painel:\n${base(req)}/app#/admin/conferir`;
    let avisado = false;
    if (papiLigada() && cfg.dono.whats) avisado = (await enviarWhats(cfg.dono.whats, texto)).ok;
    return enviar(res, 200, { parcelas: ud, avisado, texto, fone: cfg.dono.whats });
  }

  // meus dados (entram no contrato) e Pix para receber as reservas
  if (acao === 'dados') {
    const d = corpo.dados || {};
    const novo = {};
    for (const k of DONO_CAMPOS) novo[k] = txt(d[k], k === 'endereco' ? 220 : 120);
    novo.pix = { chave: txt(d.pix?.chave, 80), nome: txt(d.pix?.nome, 25), cidade: txt(d.pix?.cidade, 15) };
    await gravar(chaveDono(u.id), novo);
    if (!individual() && novo.whats !== u.whats) { u.whats = novo.whats; await salvarConfig(cfg); }
    return enviar(res, 200, { dados: novo, faltaDados: faltaNoDono(novo) });
  }

  if (acao === 'anuncio') {
    const a0 = await lerAnuncio(u), d = corpo.anuncio || {};
    const a = {
      ...a0, exemplo: false, ativo: !!d.ativo,
      titulo: txt(d.titulo, 90) || a0.titulo, descricao: txt(d.descricao, 3000), regras: txt(d.regras, 3000), requisitos: txt(d.requisitos, 3000),
      cancelamento: txt(d.cancelamento, 3000), observacoesContrato: txt(d.observacoesContrato, 3000),
      capacidade: Math.min(5, num(d.capacidade, 1, 5) || 5), quartos: num(d.quartos, 0, 20), camas: num(d.camas, 0, 40), banheiros: num(d.banheiros, 0, 20),
      diaria: num(d.diaria), diariaFds: num(d.diariaFds), limpeza: num(d.limpeza), caucao: num(d.caucao), minNoites: num(d.minNoites, 1, 90),
      checkin: /^\d{2}:\d{2}$/.test(d.checkin) ? d.checkin : a0.checkin, checkout: /^\d{2}:\d{2}$/.test(d.checkout) ? d.checkout : a0.checkout,
      comodidades: (Array.isArray(d.comodidades) ? d.comodidades : []).filter((k) => COMODIDADES[k]),
      sinalPct: Math.round(num(d.sinalPct, 1, 100)) || 100,
      pacotes: (Array.isArray(d.pacotes) ? d.pacotes : []).filter((p) => isoValida(p?.ini) && isoValida(p?.fim) && p.fim > p.ini && Number(p.casal) > 0).slice(0, 20).map((p, i) => ({
        id: txt(p.id, 40) || `pacote-${i + 1}`, nome: txt(p.nome, 40) || 'Pacote', ini: p.ini, fim: p.fim,
        checkin: /^\d{2}:\d{2}$/.test(p.checkin) ? p.checkin : '17:00', checkout: /^\d{2}:\d{2}$/.test(p.checkout) ? p.checkout : '16:00',
        casal: num(p.casal), acompanhante: num(p.acompanhante), limpeza: num(p.limpeza, 0, 100000) || 0, idadeMin: Math.round(num(p.idadeMin, 0, 18)) || 6, ativo: p.ativo !== false,
      })),
      especiais: (Array.isArray(d.especiais) ? d.especiais : []).filter((e) => isoValida(e.ini) && isoValida(e.fim) && e.fim >= e.ini && Number(e.diaria) > 0)
        .slice(0, 30).map((e) => ({ nome: txt(e.nome, 40), ini: e.ini, fim: e.fim, diaria: num(e.diaria) })),
    };
    if (a.diaria <= 0) throw new Erro('Informe o valor da diária.');
    await salvarAnuncio(u.id, a);
    return enviar(res, 200, { anuncio: a });
  }
  if (acao === 'foto') {
    const a = await lerAnuncio(u);
    if ((a.fotos || []).length >= 12) throw new Erro('Máximo de 12 fotos por unidade.');
    const arq = decodificar(corpo.dados, corpo.tipo, 3.5);
    if (arq.erro || arq.tipo === 'application/pdf') throw new Erro(arq.erro || 'Envie uma imagem.');
    const url = await salvarPublico(`anuncios/${u.id}/foto.${arq.ext}`, arq.buf, arq.tipo);
    a.fotos = [...(a.fotos || []), url];
    await salvarAnuncio(u.id, a);
    return enviar(res, 200, { anuncio: a });
  }
  if (acao === 'removerFoto' || acao === 'fotoPrincipal') {
    const a = await lerAnuncio(u);
    if (!(a.fotos || []).includes(corpo.url)) throw new Erro('Foto não encontrada.');
    a.fotos = a.fotos.filter((f) => f !== corpo.url);
    if (acao === 'fotoPrincipal') a.fotos.unshift(corpo.url); else await apagarArquivo(corpo.url);
    await salvarAnuncio(u.id, a);
    return enviar(res, 200, { anuncio: a });
  }
  if (acao === 'bloqueios') {
    const a = await lerAnuncio(u);
    const set = new Set(a.bloqueios || []);
    for (const d of (corpo.datas || []).filter(isoValida).slice(0, 400)) corpo.bloquear ? set.add(d) : set.delete(d);
    a.bloqueios = [...set].sort();
    await salvarAnuncio(u.id, a);
    return enviar(res, 200, { anuncio: a, ocupadas: await noitesOcupadas(u.id, a) });
  }

  // ---------- reservas ----------
  if (acao === 'reserva') {
    let r = await minhaReserva(q.id || corpo.id);
    return enviar(res, 200, { reserva: await visaoCompleta(r), integracoes: { papi: papiLigada(), autentique: autentiqueLigada(), autentiqueTeste: autentiqueTeste() }, linkHospede: linkHospede(req, r) });
  }
  if (['confirmar', 'contrato', 'autentique', 'atualizar', 'govbrFinal', 'cancelar', 'metodo', 'restanteRecebido', 'aceiteLocador'].includes(acao)) {
    const r = await minhaReserva(corpo.id);
    const st = statusReal(r);
    let aviso = null;
    if (acao === 'confirmar') {
      if (!['pre', 'pago_informado'].includes(st)) throw new Erro('Esta reserva não está aguardando confirmação.');
      r.status = 'confirmada'; r.confirmadaEm = new Date().toISOString(); r.expiraEm = null;
      historico(r, 'Pagamento conferido e reserva confirmada');
      const metodo = corpo.metodo === 'govbr' ? 'govbr' : corpo.metodo === 'aceite' && papiLigada() ? 'aceite' : (autentiqueLigada() ? 'autentique' : 'govbr');
      try {
        const g = await gerarContrato(r);
        r.contrato.metodo = metodo;
        historico(r, 'Contrato gerado');
        if (metodo === 'autentique') await enviarParaAutentique(req, r, g);
        if (metodo === 'aceite') { r.status = 'assinatura'; historico(r, 'Contrato aguardando aceite por código'); }
      } catch (e) { aviso = e.message; }
      if (papiLigada()) await enviarWhats(r.titular.whats, msg.confirmadaParaHospede(r, u, cfg, linkHospede(req, r)));
    } else if (acao === 'contrato') {
      if (['cancelada', 'expirada'].includes(st)) throw new Erro('Reserva cancelada.');
      await gerarContrato(r); historico(r, 'Contrato gerado novamente');
    } else if (acao === 'metodo') {
      if (!r.contrato) throw new Erro('Gere o contrato primeiro.');
      r.contrato.metodo = corpo.metodo === 'autentique' ? 'autentique' : corpo.metodo === 'aceite' ? 'aceite' : 'govbr';
      if (r.contrato.metodo === 'aceite' && !papiLigada()) throw new Erro('O aceite por código precisa do WhatsApp automático (PAPI) ligado.');
    } else if (acao === 'autentique') {
      if (r.contrato?.autentique?.id) throw new Erro('Este contrato já foi enviado para a Autentique.');
      if (!r.contrato?.key) await gerarContrato(r);
      await enviarParaAutentique(req, r);
    } else if (acao === 'atualizar') {
      await atualizarAutentique(req, r);
    } else if (acao === 'govbrFinal') {
      const arq = decodificar(corpo.dados, 'application/pdf', 4);
      if (arq.erro || arq.tipo !== 'application/pdf') throw new Erro('Envie o PDF assinado.');
      r.contrato = r.contrato || {};
      if (r.contrato.finalKey) await apagarArquivo(r.contrato.finalKey);
      r.contrato.finalKey = await salvarPrivado(`priv/${r.uid}/contratos/${r.id}-final`, arq.buf);
      r.contrato.finalEm = new Date().toISOString(); r.contrato.metodo = 'govbr';
      r.status = 'assinado';
      historico(r, 'Contrato assinado pelas duas partes (gov.br) enviado pelo dono');
      if (papiLigada()) await enviarWhats(r.titular.whats, msg.assinado(r, u, linkHospede(req, r)));
    } else if (acao === 'aceiteLocador') {
      const dn = await lerDono(r.uid);
      await registrarAceite(req, r, 'locador', { nome: dn.nome, cpf: dn.cpf, canal: admin ? 'painel do proprietário, acesso com senha' : 'área do dono da unidade, acesso com senha' });
    } else if (acao === 'restanteRecebido') {
      if (!(r.valores.restante > 0)) throw new Erro('Esta reserva não tem restante a receber.');
      r.restante = { ...(r.restante || {}), recebidoEm: new Date().toISOString() };
      historico(r, `Restante de ${r.valores.restante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} recebido`);
    } else if (acao === 'cancelar') {
      if (st === 'cancelada') throw new Erro('Já está cancelada.');
      r.status = 'cancelada'; r.canceladaEm = new Date().toISOString(); r.motivo = txt(corpo.motivo, 300);
      historico(r, 'Reserva cancelada pelo ' + (admin ? 'administrador' : 'dono') + (r.motivo ? `: ${r.motivo}` : ''));
      if (corpo.avisar && papiLigada()) await enviarWhats(r.titular.whats, msg.canceladaParaHospede(r, u, r.motivo));
    }
    await salvarReserva(r);
    return enviar(res, 200, { reserva: await visaoCompleta(r), aviso, linkHospede: linkHospede(req, r) });
  }

  if (acao === 'vistoria' || acao === 'removerVistoria') {
    const r = await minhaReserva(corpo.id);
    if (acao === 'vistoria') await adicionarVistoria(r, corpo, 'dono');
    else await removerVistoria(r, corpo.idx, 'dono');
    await salvarReserva(r);
    return enviar(res, 200, { reserva: await visaoCompleta(r) });
  }

  if (acao === 'whats') {
    if (!papiLigada()) return enviar(res, 200, { ok: false });
    const r = await enviarWhats(corpo.fone, txt(corpo.texto, 4000));
    return enviar(res, 200, r);
  }
  if (acao === 'senha') {
    if (admin) throw new Erro('O administrador troca a senha em Ajustes.');
    await trocarSenhaDono(u.id, corpo.atual, corpo.nova);
    return enviar(res, 200, { ok: true });
  }
  if (acao === 'link') return enviar(res, 200, { link: linkDono(req, { id: '' }) });

  throw new Erro('Ação inválida.', 404);
});
