// Painel do proprietário (administrador do condomínio)
import { rota, enviar, lerCorpo, parametros, ipDe, Erro } from './_lib/http.js';
import { ler, gravar, temRedis } from './_lib/db.js';
import { assinar, exigir, aleatorio } from './_lib/auth.js';
import { temBlob, salvarPublico, apagarArquivo, decodificar } from './_lib/arquivos.js';
import { lerConfig, salvarConfig, dadosUnidade, salvarUnidade, itensDe, unidadePorSlug, slug, hojeBR, dias, fmtD, brl, dividir } from './_lib/condo.js';
import { reservasDa, resumoReserva } from './_lib/temporada.js';
import { lerAcesso, novoConvite, loginAdmin, trocarSenhaAdmin, enviarCodigo, conferirCodigo, dadosAdmin } from './_lib/acesso.js';
import { enviarWhats, papiLigada } from './_lib/whats.js';
import { autentiqueLigada, autentiqueTeste } from './_lib/autentique.js';
import { base } from './_lib/reservas.js';
import { CAPA_PADRAO, slug as slugU } from './_lib/condo.js';
import { MODO, individual } from './_lib/modo.js';
import { idsReservas, reservasDa as reservasDaU, statusReal, STATUS_BLOQUEIA } from './_lib/temporada.js';

const txt = (s, max = 300) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const num = (v, min = 0, max = 1e8) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };

export default rota(async (req, res) => {
  const q = parametros(req);
  const corpo = req.method === 'POST' ? await lerCorpo(req) : {};
  const acao = q.acao || corpo.acao;
  const ip = ipDe(req);
  const cfg = await lerConfig();

  // ---------- sem login ----------
  if (acao === 'login') {
    const a = await loginAdmin(corpo.senha, ip);
    return enviar(res, 200, { token: await assinar({ r: 'admin' }, 12 * 3600), deveTrocar: !!a.deveTrocar });
  }
  if (acao === 'esqueci') {
    const r = await enviarCodigo('admin', cfg.dono.whats, (c) => `🔐 Código para criar uma nova senha do painel ${cfg.cond.curto}: *${c}*\n\nVale por 15 minutos. Se não foi você, ignore.`, ip);
    return enviar(res, 200, r.enviado ? { ok: true, mensagem: `Enviamos um código para o WhatsApp ${r.para}.` }
      : { ok: false, mensagem: 'O WhatsApp automático não está ligado. Peça ao responsável técnico para trocar a variável ADMIN_SENHA na Vercel.' });
  }
  if (acao === 'redefinir') {
    if (!(await conferirCodigo('admin', corpo.codigo))) throw new Erro('Código inválido ou vencido.');
    await trocarSenhaAdmin(corpo.nova);
    return enviar(res, 200, { token: await assinar({ r: 'admin' }, 12 * 3600) });
  }

  await exigir(req, ['admin']);

  if (acao === 'estado') {
    const [unids, acessos, reservas, adm] = await Promise.all([
      Promise.all(cfg.unidades.map((u) => dadosUnidade(u.id))),
      Promise.all(cfg.unidades.map((u) => lerAcesso(u.id))),
      Promise.all(cfg.unidades.map((u) => reservasDa(u.id))),
      dadosAdmin(),
    ]);
    const pags = {}, acc = {};
    cfg.unidades.forEach((u, i) => {
      pags[u.id] = unids[i];
      const a = acessos[i];
      acc[u.id] = { ativo: !!a.hash, convite: a.convite && Date.now() - Date.parse(a.convite.em) < 7 * 864e5 ? a.convite.codigo : null };
    });
    return enviar(res, 200, {
      config: cfg, pags, acessos: acc, capa: (await ler('capa')) || CAPA_PADRAO, deveTrocar: !!adm.deveTrocar, modo: MODO,
      reservas: reservas.flat().map(resumoReserva).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      integracoes: { redis: temRedis(), blob: temBlob(), papi: papiLigada(), papiInstancia: process.env.PAPI_INSTANCIA || '', autentique: autentiqueLigada(), autentiqueTeste: autentiqueTeste(), adminEnv: !!process.env.ADMIN_SENHA },
      base: base(req),
    });
  }

  if (acao === 'config') {
    const c = corpo.config || {};
    if (c.cond) cfg.cond = { ...cfg.cond, nome: txt(c.cond.nome, 90) || cfg.cond.nome, endereco: txt(c.cond.endereco, 200), comarca: txt(c.cond.comarca, 60) || cfg.cond.comarca };
    if (c.pix) cfg.pix = { chave: txt(c.pix.chave, 80), nome: txt(c.pix.nome, 25), cidade: txt(c.pix.cidade, 15) };
    if (c.dono) cfg.dono = { nome: txt(c.dono.nome, 60) || 'Proprietário', whats: txt(c.dono.whats, 20) };
    if (c.planos) for (const k of Object.keys(cfg.planos)) if (c.planos[k]) {
      const p = c.planos[k];
      cfg.planos[k] = {
        nome: txt(p.nome, 40) || cfg.planos[k].nome, contrato: num(p.contrato), entrada: num(p.entrada), inter: num(p.inter),
        interAnos: (p.interAnos || []).map(Number).filter((n) => n >= 2000 && n <= 2100), mensal: num(p.mensal), mensalQtd: Math.round(num(p.mensalQtd, 0, 600)),
        condo: num(p.condo),
        condoReajustes: (Array.isArray(p.condoReajustes) ? p.condoReajustes : []).filter((r) => /^\d{4}-\d{2}$/.test(r?.desde) && Number(r.valor) >= 0)
          .slice(0, 60).map((r) => ({ desde: r.desde, valor: num(r.valor) })).sort((a, b) => a.desde.localeCompare(b.desde)),
      };
    }
    if (c.datas) {
      const d = c.datas;
      cfg.datas = {
        entrada: /^\d{4}-\d{2}-\d{2}$/.test(d.entrada) ? d.entrada : cfg.datas.entrada,
        mensal1: /^\d{4}-\d{2}$/.test(d.mensal1) ? d.mensal1 : cfg.datas.mensal1, condo1: /^\d{4}-\d{2}$/.test(d.condo1) ? d.condo1 : cfg.datas.condo1,
        dia: Math.round(num(d.dia, 1, 31)), interMes: Math.round(num(d.interMes, 1, 12)), interDia: Math.round(num(d.interDia, 1, 31)),
      };
    }
    if (Array.isArray(c.unidades)) for (const nu of c.unidades) {
      const u = cfg.unidades.find((x) => x.id === nu.id);
      if (!u) continue;
      u.nome = txt(nu.nome, 60) || u.nome; u.whats = txt(nu.whats, 20); u.piso = txt(nu.piso, 40) || u.piso;
      if (cfg.planos[nu.tipo]) u.tipo = nu.tipo;
    }
    if (c.streetview !== undefined) {
      const m = String(c.streetview).match(/src="([^"]+)"/);
      const src = (m ? m[1] : String(c.streetview)).trim();
      if (src && !/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed\?/.test(src)) throw new Erro('Cole o código "Incorporar um mapa" do Google Maps (começa com <iframe src="https://www.google.com/maps/embed?...).');
      cfg.streetview = src;
    }
    if (c.prazoPreHoras !== undefined) cfg.prazoPreHoras = Math.round(num(c.prazoPreHoras, 1, 72));
    if (c.assinatura) cfg.assinatura = ['govbr', 'aceite'].includes(c.assinatura) ? c.assinatura : 'autentique';
    if (c.site) cfg.site = { marca: txt(c.site.marca, 60) || cfg.site?.marca, titulo: txt(c.site.titulo, 80), destaque: txt(c.site.destaque, 60), sub: txt(c.site.sub, 400) };
    if (c.popup) cfg.popup = { ativo: !!c.popup.ativo, segundos: Math.min(10, Math.max(2, Number(c.popup.segundos) || 3.5)) };
    if (Array.isArray(c.anuncios)) {
      const atuais = new Map((cfg.anuncios || []).map((x) => [x.url, x]));
      cfg.anuncios = c.anuncios.filter((x) => atuais.has(x.url)).map((x) => ({ url: x.url, acao: /^(datas|tipo:(apto|kit)|pacote:.{1,40})$/.test(x.acao) ? x.acao : 'datas', ativo: x.ativo !== false }));
    }
    await salvarConfig(cfg);
    return enviar(res, 200, { config: cfg });
  }

  if (acao === 'senha') { await trocarSenhaAdmin(corpo.nova); return enviar(res, 200, { ok: true }); }

  // ---------- parcelas ----------
  const u = corpo.u ? unidadePorSlug(cfg, corpo.u) : null;
  if (['baixa', 'desfazer', 'recusar', 'ajustar', 'restaurar', 'aviso'].includes(acao)) {
    if (!u) throw new Erro('Unidade não encontrada.');
    const ud = await dadosUnidade(u.id);
    const keys = (corpo.keys || [corpo.key]).filter(Boolean);
    const agora = new Date().toISOString();
    if (acao === 'baixa') {
      const its = itensDe(cfg, u, ud).filter((i) => keys.includes(i.k));
      for (const it of its) ud.pag[it.k] = { ...(ud.pag[it.k] || {}), st: 'pago', conf: agora, valor: it.valor, via: ud.pag[it.k]?.via || 'dono' };
    } else if (acao === 'desfazer' || acao === 'recusar') keys.forEach((k) => delete ud.pag[k]);
    else if (acao === 'ajustar') {
      const v = num(corpo.valor, 0, 1e8);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(corpo.venc || '')) throw new Erro('Data inválida.');
      ud.ajuste[corpo.key] = { valor: v, venc: corpo.venc };
    } else if (acao === 'restaurar') delete ud.ajuste[corpo.key];
    else if (acao === 'aviso') { ud.avisos = ud.avisos || {}; ud.avisos[corpo.tipo === 'pos' ? 'pos' : 'pre'] = agora; }
    await salvarUnidade(u.id, ud);
    return enviar(res, 200, { u: u.id, parcelas: ud });
  }

  // avisos em lote pela PAPI
  if (acao === 'avisoLote') {
    if (!papiLigada()) throw new Erro('A PAPI não está ligada.');
    const tipo = corpo.tipo === 'pos' ? 'pos' : 'pre', hoje = hojeBR();
    let ok = 0, total = 0;
    for (const un of cfg.unidades) {
      const ud = await dadosUnidade(un.id);
      const its = itensDe(cfg, un, ud).filter((i) => tipo === 'pos' ? i.st === 'vencido' : (i.st === 'aberto' && dias(hoje, i.venc) <= 3));
      if (!its.length || !un.whats) continue;
      total++;
      const tot = its.reduce((s, i) => s + i.valor, 0);
      const linhas = its.map((i) => `📄 ${i.titulo}\n📅 Vencimento: ${fmtD(i.venc)}\n💵 ${brl(i.valor)}`).join('\n\n');
      const link = `${base(req)}/app#/dono`;
      const t = tipo === 'pre'
        ? `🔔 *Lembrete de vencimento*\n\nOlá, ${un.nome}! Tudo bem?\n${its.length > 1 ? 'Estas parcelas vencem' : 'Esta parcela vence'} nos próximos dias:\n\n${linhas}\n\n*Total: ${brl(tot)}*\n\n📲 Pague com Pix pelo app:\n${link}\n\n🌙☀️🌊 ${cfg.cond.nome}`
        : `⚠️ *Parcela em atraso*\n\nOlá, ${un.nome}.\nNão encontramos o pagamento de:\n\n${linhas}\n\n*Total em aberto: ${brl(tot)}*\n\n📲 Regularize com Pix pelo app:\n${link}\n\nSe já pagou, é só tocar em "Já paguei" no app que a gente confere. 🙏\n\n🌙☀️🌊 ${cfg.cond.nome}`;
      const r = await enviarWhats(un.whats, t);
      if (r.ok) { ok++; ud.avisos = ud.avisos || {}; ud.avisos[tipo] = new Date().toISOString(); await salvarUnidade(un.id, ud); }
    }
    return enviar(res, 200, { ok, total });
  }

  if (acao === 'whats') {
    if (!papiLigada()) return enviar(res, 200, { ok: false, motivo: 'PAPI não configurada' });
    return enviar(res, 200, await enviarWhats(corpo.fone, txt(corpo.texto, 4000)));
  }

  // ---------- anúncios do popup ----------
  if (acao === 'anuncioFoto') {
    if ((cfg.anuncios || []).length >= 10) throw new Erro('Máximo de 10 anúncios.');
    const arq = decodificar(corpo.dados, corpo.tipo, 3.5);
    if (arq.erro || arq.tipo === 'application/pdf') throw new Erro(arq.erro || 'Envie uma imagem.');
    const url = await salvarPublico(`anuncios/anuncio.${arq.ext}`, arq.buf, arq.tipo);
    cfg.anuncios = [...(cfg.anuncios || []), { url, acao: 'datas', ativo: true }];
    await salvarConfig(cfg);
    return enviar(res, 200, { config: cfg });
  }
  if (acao === 'removerAnuncio') {
    cfg.anuncios = (cfg.anuncios || []).filter((x) => x.url !== corpo.url);
    await salvarConfig(cfg);
    if (!String(corpo.url).startsWith('/assets/')) await apagarArquivo(corpo.url);
    return enviar(res, 200, { config: cfg });
  }

  // ---------- unidades do site individual ----------
  if (acao === 'unidadeSalvar') {
    if (!individual()) throw new Erro('No site geral as unidades são fixas.');
    const x = corpo.unidade || {};
    const tipo = ['apto', 'kc', 'kf'].includes(x.tipo) ? x.tipo : 'apto';
    const numU = Math.round(num(x.num, 1, 9999));
    if (!numU) throw new Erro('Informe o número da unidade.');
    let u = x.id ? cfg.unidades.find((k) => k.id === x.id) : null;
    if (x.id && !u) throw new Erro('Unidade não encontrada.');
    const novo = { ...(u || { id: 'u' + aleatorio(6), whats: '' }), num: numU, tipo, nome: txt(x.nome, 40) || (tipo === 'apto' ? 'Apto ' : 'Kitnet ') + numU, apelido: txt(x.apelido, 40), piso: txt(x.piso, 40) || (tipo === 'apto' ? 'Apartamento' : 'Kitnet') };
    if (cfg.unidades.some((k) => k.id !== novo.id && slugU(k) === slugU(novo))) throw new Erro('Já existe uma unidade com esse tipo e número.');
    cfg.unidades = u ? cfg.unidades.map((k) => (k.id === novo.id ? novo : k)) : [...cfg.unidades, novo];
    await salvarConfig(cfg);
    return enviar(res, 200, { config: cfg, unidade: novo });
  }
  if (acao === 'unidadeRemover') {
    if (!individual()) throw new Erro('No site geral as unidades são fixas.');
    const un = cfg.unidades.find((k) => k.id === corpo.id);
    if (!un) throw new Erro('Unidade não encontrada.');
    if (cfg.unidades.length <= 1) throw new Erro('O site precisa de pelo menos uma unidade.');
    const ativas = (await reservasDaU(un.id)).filter((r) => STATUS_BLOQUEIA.includes(statusReal(r)));
    if (ativas.length) throw new Erro(`Esta unidade tem ${ativas.length} reserva(s) ativa(s). Cancele ou conclua antes de remover.`);
    cfg.unidades = cfg.unidades.filter((k) => k.id !== un.id);
    await salvarConfig(cfg);
    return enviar(res, 200, { config: cfg });
  }

  // ---------- melhorias e extras (ex.: pintura) ----------
  if (acao === 'extra') {
    const x = corpo.extra || {};
    const nome = txt(x.nome, 60);
    if (!nome) throw new Erro('Dê um nome para a cobrança (ex.: Pintura da fachada).');
    const valor = num(x.valor, 0, 1e8);
    if (!(valor > 0)) throw new Erro('Informe o valor.');
    const parcelas = Math.round(num(x.parcelas, 1, 60)) || 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.venc1 || '')) throw new Erro('Escolha o vencimento da 1ª parcela.');
    const ids = [...new Set(Array.isArray(x.unidades) ? x.unidades : [])].filter((id) => cfg.unidades.some((un) => un.id === id));
    if (!ids.length) throw new Erro('Marque pelo menos uma unidade.');
    const modo = x.modo === 'fixo' ? 'fixo' : 'dividir';
    const valores = modo === 'fixo' ? ids.map(() => valor) : dividir(valor, ids.length);
    const ext = {
      id: aleatorio(8), nome, descricao: txt(x.descricao, 400), modo, valorInformado: valor, parcelas, venc1: x.venc1,
      unidades: Object.fromEntries(ids.map((id, i) => [id, valores[i]])),
      total: Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100, criadoEm: new Date().toISOString(),
    };
    cfg.extras = [...(cfg.extras || []), ext];
    await salvarConfig(cfg);
    return enviar(res, 200, { config: cfg, extra: ext });
  }
  if (acao === 'removerExtra') {
    const ext = (cfg.extras || []).find((x) => x.id === corpo.id);
    if (!ext) throw new Erro('Cobrança não encontrada.');
    const pref = 'X' + ext.id + '-';
    const unids = await Promise.all(Object.keys(ext.unidades).map(async (uid) => [uid, await dadosUnidade(uid)]));
    const pagas = unids.filter(([, ud]) => Object.entries(ud.pag || {}).some(([k, r]) => k.startsWith(pref) && r.st === 'pago')).length;
    if (pagas && !corpo.forcar) throw new Erro(`${pagas} unidade(s) já pagaram parte desta cobrança. Para excluir mesmo assim, confirme de novo.`);
    for (const [uid, ud] of unids) {
      let mudou = false;
      for (const obj of [ud.pag || {}, ud.ajuste || {}]) for (const k of Object.keys(obj)) if (k.startsWith(pref)) { delete obj[k]; mudou = true; }
      if (mudou) await salvarUnidade(uid, ud);
    }
    cfg.extras = cfg.extras.filter((x) => x.id !== ext.id);
    await salvarConfig(cfg);
    return enviar(res, 200, { config: cfg });
  }

  // ---------- acesso dos donos ----------
  if (acao === 'convite') {
    if (!u) throw new Erro('Unidade não encontrada.');
    if (corpo.resetar) await gravar('acesso:' + u.id, {});
    const codigo = await novoConvite(u.id);
    return enviar(res, 200, { codigo, link: `${base(req)}/app#/primeiro/${slug(u)}` });
  }

  // ---------- fotos da capa ----------
  if (acao === 'capaFoto') {
    const atual = (await ler('capa')) || [];
    if (atual.length >= 8) throw new Erro('Máximo de 8 fotos na capa.');
    const arq = decodificar(corpo.dados, corpo.tipo, 3.5);
    if (arq.erro || arq.tipo === 'application/pdf') throw new Erro(arq.erro || 'Envie uma imagem.');
    const url = await salvarPublico(`capa/foto.${arq.ext}`, arq.buf, arq.tipo);
    await gravar('capa', [...atual, url]);
    return enviar(res, 200, { capa: [...atual, url] });
  }
  if (acao === 'removerCapa') {
    const atual = (await ler('capa')) || [];
    const nova = atual.filter((x) => x !== corpo.url);
    await gravar('capa', nova);
    if (!CAPA_PADRAO.includes(corpo.url)) await apagarArquivo(corpo.url);
    return enviar(res, 200, { capa: nova.length ? nova : CAPA_PADRAO });
  }

  throw new Erro('Ação inválida.', 404);
});
