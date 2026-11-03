/* App do condomínio: área do dono da unidade (parcelas, temporada, dados) e painel do proprietário */
'use strict';

const app = $('#app');
const GRUPOS = { E:{nome:'Entrada', ico:'🔑'}, M:{nome:'Mensalidades', ico:'🏠'}, I:{nome:'Intermediárias', ico:'⭐'}, C:{nome:'Condomínio', ico:'🌊'}, X:{nome:'Melhorias / Extras', ico:'🛠️'} };
const STATUS_RES = { pre:'Aguardando Pix', pago_informado:'Pix informado', confirmada:'Confirmada', assinatura:'Em assinatura', assinado:'Contrato assinado', cancelada:'Cancelada', expirada:'Expirada' };
const BLOQUEIA = ['pre','pago_informado','confirmada','assinatura','assinado'];
// site individual (ex.: Apto 4 Maya): um proprietário só, sem parcelas nem condomínio
const indiv = () => (ADM?.modo || DONO?.modo || LISTA?.modo) === 'individual';
const TIPOS_U = { apto:'Apartamento', kc:'Kitnet de cima', kf:'Kitnet de frente' };

/* ---------------- sessão ---------------- */
const lerJ = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } };
const gravarJ = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
let SD = lerJ('lsm_dono');      // { token, slug, nome }
let SA = lerJ('lsm_admin');     // { token }
let S = null;                   // estado no formato das parcelas: cond, planos, datas, pix, dono, unidades, pag, ajuste, avisos
let DONO = null;                // painel da unidade (dono ou admin vendo uma unidade)
let ADM = null;                 // estado do painel do proprietário
let hojeSim = '';               // só para o administrador simular uma data nesta tela

function rota(){
  const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  return p;
}
function sairDono(){ SD = null; gravarJ('lsm_dono', null); DONO = null; location.hash = '#/'; }
function sairAdmin(){ SA = null; gravarJ('lsm_admin', null); ADM = null; location.hash = '#/admin'; }
async function chamar(fn){
  try { return await fn(); }
  catch(e){
    if (e.status === 401 && /sessão/i.test(e.message)){ toast(e.message); if (rota()[0] === 'admin') sairAdmin(); else sairDono(); }
    throw e;
  }
}
const apiDono = (acao, corpo = {}, metodoGet = false) => chamar(() => {
  const ctx = ctxAtual();
  if (metodoGet) return api(`/api/dono?acao=${acao}${ctx.u ? '&u=' + ctx.u : ''}${corpo.id ? '&id=' + encodeURIComponent(corpo.id) : ''}`, { token: ctx.token });
  return api('/api/dono', { corpo:{ acao, ...(ctx.u ? { u:ctx.u } : {}), ...corpo }, token: ctx.token });
});
const apiAdmin = (acao, corpo = {}, metodoGet = false) => chamar(() => metodoGet ? api('/api/admin?acao=' + acao, { token: SA?.token }) : api('/api/admin', { corpo:{ acao, ...corpo }, token: SA?.token }));
// contexto: dono logado ou administrador abrindo uma unidade
function ctxAtual(){
  const p = rota();
  if (p[0] === 'admin' && p[1] === 'unidade') return { token: SA?.token, u: p[2], admin:true, base:`#/admin/unidade/${p[2]}` };
  return { token: SD?.token, u: null, admin:false, base:'#/dono' };
}
async function enviarWhats(fone, texto, { quem = 'admin' } = {}){
  const papi = quem === 'admin' ? ADM?.integracoes?.papi : DONO?.integracoes?.papi;
  if (papi && digitos(fone)){
    try { const r = quem === 'admin' ? await apiAdmin('whats', { fone, texto }) : await apiDono('whats', { fone, texto }); if (r.ok){ toast('✅ Mensagem enviada pelo WhatsApp automático'); return 'papi'; } }
    catch(e){}
    toast('O WhatsApp automático não respondeu. Abrindo o WhatsApp...');
  }
  abrirWhats(fone, texto); return 'whats';
}

/* ---------------- parcelas (mesma regra do servidor) ---------------- */
function hoje(){ return hojeSim || hojeLocal(); }
function statusDe(u, it){
  const r = S.pag[u.id]?.[it.k];
  if (r?.st === 'pago') return 'pago';
  if (r?.st === 'aguardando') return 'aguardando';
  const d = dias(hoje(), it.venc);
  if (d < 0) return 'vencido'; if (d <= 3) return 'vence'; if (d <= 31) return 'aberto'; return 'futuro';
}
function rotulo(it){
  const d = dias(hoje(), it.venc);
  switch (it.st){
    case 'pago': return 'Pago · baixado';
    case 'aguardando': return 'Em conferência';
    case 'vencido': return d === -1 ? 'Venceu ontem' : `Vencido há ${-d} dias`;
    case 'vence': return d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`;
    case 'aberto': return 'Em aberto';
    default: return 'A vencer';
  }
}
// condomínio: mensal e sem prazo final; reajuste vale a partir do mês escolhido
function valorCondo(p, ym){
  let v = Number(p.condo) || 0;
  for (const r of [...(p.condoReajustes || [])].sort((a,b) => a.desde.localeCompare(b.desde))) if (r.desde <= ym) v = Number(r.valor) || 0;
  return v;
}
function dividir(total, n){
  const c = Math.round(Number(total) * 100), base = Math.floor(c / n), out = Array(n).fill(base);
  for (let i = 0; i < c - base * n; i++) out[i]++;
  return out.map(x => x / 100);
}
function itensDe(u, { ateMes } = {}){
  const p = S.planos[u.tipo], D = S.datas, aj = S.ajuste[u.id] || {}, out = [];
  const add = (it) => {
    const a = aj[it.k];
    if (a){ if (a.valor !== undefined && a.valor !== '' && a.valor !== null) it.valor = Number(a.valor); if (a.venc) it.venc = a.venc; it.ajustado = true; }
    it.st = statusDe(u, it); out.push(it);
  };
  if (Number(p.entrada) > 0) add({ k:'E', g:'E', titulo:'Entrada', sub:'Sinal do imóvel', valor:Number(p.entrada), venc:D.entrada });
  for (let i = 1; i <= Number(p.mensalQtd); i++){ const v = addMes(D.mensal1, i-1, Number(D.dia)); add({ k:'M'+pad(i,3), g:'M', n:i, titulo:`Mensalidade ${i}/${p.mensalQtd}`, sub:`Parcela de ${mesAno(v)}`, valor:Number(p.mensal), venc:v }); }
  (p.interAnos || []).forEach((y, i) => add({ k:'I'+y, g:'I', n:i+1, titulo:`Intermediária ${i+1}/${p.interAnos.length}`, sub:`Anual - ${MESES_L[Number(D.interMes)-1]} de ${y}`, valor:Number(p.inter), venc:`${y}-${pad(D.interMes)}-${pad(D.interDia)}` }));
  // mostra até 2 meses à frente (ou até o último mês já pago adiantado)
  let ate = ateMes || addMes(hoje().slice(0,7), 2, 1).slice(0,7);
  const pagoAdiante = Object.keys(S.pag[u.id] || {}).filter(k => /^C\d{4}-\d{2}$/.test(k)).map(k => k.slice(1)).sort().pop();
  if (!ateMes && pagoAdiante && pagoAdiante > ate) ate = pagoAdiante;
  for (let i = 0; i < 1200; i++){
    const ym = addMes(D.condo1, i, 1).slice(0,7); if (ym > ate) break;
    const v = addMes(ym, 0, Number(D.dia));
    add({ k:'C'+ym, g:'C', titulo:`Condomínio ${mesAno(ym+'-01')}`, sub:'Condomínio, água e IPTU (mensal)', valor:valorCondo(p, ym), venc:v });
  }
  for (const x of S.extras || []){
    const vu = x.unidades?.[u.id]; if (vu === undefined) continue;
    const n = Math.max(1, Number(x.parcelas) || 1), dia = Number(String(x.venc1).slice(8,10)) || 10;
    dividir(vu, n).forEach((v, i) => add({ k:`X${x.id}-${pad(i+1)}`, g:'X', titulo: n > 1 ? `${x.nome} ${i+1}/${n}` : x.nome, sub:'Melhorias / Extras', valor:v, venc: i === 0 ? x.venc1 : addMes(x.venc1, i, dia) }));
  }
  return out;
}
function resumo(u, its = itensDe(u)){
  const r = { pagoImovel:0, totalImovel:0, pagoCondo:0, totalCondo:0, pagoExtra:0, totalExtra:0, n:{}, venc:[], vence:[], aguard:[], vencC:0, devidosC:0 };
  for (const g of 'EMICX') r.n[g] = { pagas:0, total:0, valorPago:0, valorTotal:0 };
  const mesAtual = hoje().slice(0,7);
  for (const it of its){
    const n = r.n[it.g]; n.total++; n.valorTotal += it.valor;
    const pago = it.st === 'pago';
    if (pago){ n.pagas++; n.valorPago += it.valor; }
    if (it.g === 'C'){ r.totalCondo += it.valor; if (pago) r.pagoCondo += it.valor; if (it.venc.slice(0,7) <= mesAtual || pago) r.devidosC++; if (it.st === 'vencido') r.vencC++; }
    else if (it.g === 'X'){ r.totalExtra += it.valor; if (pago) r.pagoExtra += it.valor; }
    else { r.totalImovel += it.valor; if (pago) r.pagoImovel += it.valor; }
    if (it.st === 'vencido') r.venc.push(it); if (it.st === 'vence') r.vence.push(it); if (it.st === 'aguardando') r.aguard.push(it);
  }
  r.situacao = r.venc.length ? 'vencido' : r.aguard.length ? 'aguardando' : r.vence.length ? 'vence' : 'pago';
  return r;
}
const somaPlano = (p) => Number(p.entrada) + Number(p.inter) * (p.interAnos||[]).length + Number(p.mensal) * Number(p.mensalQtd);
const corSit = { vencido:'var(--bad)', aguardando:'var(--wait)', vence:'var(--warn)', pago:'var(--ok)' };
const txtSit = { vencido:'Com atraso', aguardando:'Em conferência', vence:'Vence em breve', pago:'Em dia' };
const slugDe = (u) => (u.tipo === 'apto' ? 'apto-' : 'kitnet-') + (u.num ?? u.id.slice(1));
const unidade = (id) => S.unidades.find(u => u.id === id);
const unidadeSlug = (s) => S.unidades.find(u => slugDe(u) === s);
const linkApp = () => location.origin + '/app#/dono';
const assinatura = () => `\n\n🌙☀️🌊 ${S.cond.nome}`;
const linhaItem = (it) => `📄 ${it.titulo}\n📅 Vencimento: ${fmtD(it.venc)}\n💵 ${brl(it.valor)}`;
const msgPre = (u, its) => `🔔 *Lembrete de vencimento*\n\nOlá, ${u.nome}! Tudo bem?\n${its.length > 1 ? 'Estas parcelas vencem' : 'Esta parcela vence'} nos próximos dias:\n\n${its.map(linhaItem).join('\n\n')}\n\n*Total: ${brl(its.reduce((a,b)=>a+b.valor,0))}*\n\n📲 Pague com Pix pelo app:\n${linkApp()}${assinatura()}`;
const msgPos = (u, its) => `⚠️ *Parcela em atraso*\n\nOlá, ${u.nome}.\nNão encontramos o pagamento de:\n\n${its.map(linhaItem).join('\n\n')}\n\n*Total em aberto: ${brl(its.reduce((a,b)=>a+b.valor,0))}*\n\n📲 Regularize com Pix pelo app:\n${linkApp()}\n\nSe já pagou, é só tocar em "Já paguei" no app que a gente confere. 🙏${assinatura()}`;
const msgConfirmado = (u, its) => `✅ *Pagamento confirmado*\n\nOlá, ${u.nome}!\nRecebemos e demos baixa em:\n\n${its.map(it => `📄 ${it.titulo} - ${brl(it.valor)}`).join('\n')}\n\nObrigado! 🙏\n\n📲 Seu extrato: ${linkApp()}${assinatura()}`;

/* =========================================================
   ROTEAMENTO
   ========================================================= */
let ultimaRota = '', versao = 0;
// cada troca de tela ganha um número; tela antiga que termina de carregar depois não sobrescreve a nova
const velha = (v) => v !== versao;
async function render(){
  const v = ++versao;
  const p = rota(), chave = location.hash, mudou = chave !== ultimaRota; ultimaRota = chave;
  const y = scrollY;
  try {
    if (!LISTA) await listaUnidades().catch(() => null);
    if (velha(v)) return;
    if (indiv() && p[0] !== 'admin'){ location.hash = '#/admin'; return; }
    if (p[0] === 'admin') await telaAdmin(p, v);
    else if (p[0] === 'primeiro') await telaPrimeiro(p[1], v);
    else if (p[0] === 'dono') await telaDono(p, v);
    else await telaEntrar(v);
  } catch(e){
    if (e.status === 401 || velha(v)) return;
    app.innerHTML = `<div class="wrap"><div class="empty"><b>😕</b>${esc(e.message)}<br><br><button class="btn btn-ghost" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
  window.scrollTo(0, mudou ? 0 : y);
}
window.addEventListener('hashchange', () => { fecharModal(); render(); });
// voltou para o app (outra aba ou celular desbloqueado): busca as novidades, se não houver janela aberta
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#ov') && ['dono','admin'].includes(rota()[0]) && (SD?.token || SA?.token)) render(); });

/* =========================================================
   ENTRAR
   ========================================================= */
let LISTA = null;
async function listaUnidades(){ if (!LISTA) LISTA = await api('/api/dono?acao=unidades'); return LISTA; }
const opcoesUnidades = (sel) => {
  const g = [['Apartamentos', u => u.tipo === 'apto'], ['Kitnets', u => u.tipo !== 'apto']];
  return g.map(([t, f]) => `<optgroup label="${t}">${LISTA.unidades.filter(f).map(u => `<option value="${u.slug}" ${u.slug===sel?'selected':''}>${esc(u.nome)}</option>`).join('')}</optgroup>`).join('');
};
async function telaEntrar(v){
  if (SD?.token) { location.hash = '#/dono'; return; }
  await listaUnidades();
  if (velha(v)) return;
  const ult = lerJ('lsm_ultima');
  app.innerHTML = `<div class="login"><div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center"><a class="back" href="/">${I.back} Site</a>${botaoTema()}</div>
    <div style="display:flex;align-items:center;gap:12px;margin:16px 0 6px"><span class="brand-mark">${I.logo}</span><div><h1 class="h-title" style="font-size:24px">Área do dono</h1><p class="h-sub" style="margin:0">${esc(LISTA.cond.nome)}</p></div></div>
    <p class="hint">Cada apartamento e kitnet tem a sua senha. Você vê só a sua unidade.</p>
    <form id="fent" style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
      <div class="field"><label>Sua unidade</label><select class="inp" id="un"><option value="">Escolha</option>${opcoesUnidades(ult)}</select></div>
      <div class="field"><label>Senha</label><input class="inp" type="password" id="sen" autocomplete="current-password"></div>
      <button class="btn btn-sun">${I.lock} Entrar</button>
    </form>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="back" data-prim>Primeiro acesso (tenho um código)</button>
      <button class="back" data-esq>Esqueci a senha</button>
    </div>
    <div class="divider"></div>
    <a class="btn btn-ghost btn-block" href="#/admin">${I.gear} Painel do proprietário</a>
  </div></div>`;
  $('#fent').onsubmit = e => { e.preventDefault(); const u = $('#un').value; if (!u) return toast('Escolha a sua unidade.');
    ocupado(e.submitter, async () => { const r = await api('/api/dono', { corpo:{ acao:'login', u, senha:$('#sen').value } }); entrouDono(r); }); };
  $('[data-prim]').onclick = () => { const u = $('#un').value; location.hash = '#/primeiro/' + (u || ''); };
  $('[data-esq]').onclick = () => { const u = $('#un').value; if (!u) return toast('Escolha a sua unidade primeiro.'); esqueciDono(u); };
}
function entrouDono(r){
  SD = { token:r.token, slug:r.unidade.slug, nome:r.unidade.nome }; gravarJ('lsm_dono', SD); gravarJ('lsm_ultima', r.unidade.slug);
  DONO = null; location.hash = '#/dono';
}
async function esqueciDono(u){
  const r = await api('/api/dono', { corpo:{ acao:'esqueci', u } }).catch(e => ({ ok:false, mensagem:e.message }));
  if (!r.ok) return modal(`<h3>Esqueci a senha</h3><p class="hint" style="margin-top:8px">${esc(r.mensagem)}</p><button class="btn btn-ghost btn-block" style="margin-top:16px" data-fechar>Entendi</button>`);
  toast(r.mensagem); location.hash = '#/primeiro/' + u;
}
async function telaPrimeiro(slug, v){
  await listaUnidades();
  if (velha(v)) return;
  app.innerHTML = `<div class="login"><div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center"><a class="back" href="#/">${I.back} Entrar</a>${botaoTema()}</div>
    <h1 class="h-title" style="font-size:24px;margin-top:16px">Criar minha senha</h1>
    <p class="hint" style="margin-top:6px">Use o código de 6 números que o proprietário enviou (ou que chegou no seu WhatsApp).</p>
    <form id="fprim" style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
      <div class="field"><label>Sua unidade</label><select class="inp" id="un"><option value="">Escolha</option>${opcoesUnidades(slug)}</select></div>
      <div class="field"><label>Código</label><input class="inp" id="cod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></div>
      <div class="field"><label>Nova senha (mínimo 6 caracteres)</label><input class="inp" type="password" id="s1" autocomplete="new-password"></div>
      <div class="field"><label>Repita a senha</label><input class="inp" type="password" id="s2" autocomplete="new-password"></div>
      <div class="field"><label>Seu WhatsApp (para avisos e para recuperar a senha)</label><input class="inp" id="wa" inputmode="tel" placeholder="(13) 99999-9999"></div>
      <button class="btn btn-sun">${I.check} Criar senha e entrar</button>
    </form></div></div>`;
  $('#wa').oninput = e => { e.target.value = mascaraFone(e.target.value); };
  $('#fprim').onsubmit = e => { e.preventDefault();
    const u = $('#un').value; if (!u) return toast('Escolha a sua unidade.');
    if ($('#s1').value.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.');
    if ($('#s1').value !== $('#s2').value) return toast('As senhas não são iguais.');
    ocupado(e.submitter, async () => { const r = await api('/api/dono', { corpo:{ acao:'definir', u, codigo:$('#cod').value, senha:$('#s1').value, whats:$('#wa').value } }); toast('✅ Senha criada'); entrouDono(r); });
  };
}

/* =========================================================
   ÁREA DO DONO (também usada pelo administrador)
   ========================================================= */
async function carregarDono(forcar){
  if (DONO && !forcar && DONO._u === (ctxAtual().u || SD?.slug)) return DONO;
  const d = await apiDono('painel', {}, true);
  d._u = ctxAtual().u || SD?.slug;
  DONO = d;
  S = { ...d.config, unidades:[d.unidade], pag:{ [d.unidade.id]: d.parcelas.pag || {} }, ajuste:{ [d.unidade.id]: d.parcelas.ajuste || {} }, avisos:{ [d.unidade.id]: d.parcelas.avisos || {} } };
  return DONO;
}
function navDono(at){
  const n = (DONO?.reservas || []).filter(r => r.status === 'pago_informado').length;
  const itens = indiv() ? [['temporada', 'Temporada', I.beach, n], ['dados', 'Meus dados', I.user]] : [['', 'Parcelas', I.money], ['temporada', 'Temporada', I.beach, n], ['dados', 'Meus dados', I.user]];
  const ctx = ctxAtual();
  const lnk = (k) => ctx.base + (k ? '/' + k : '');
  return {
    side:`<aside class="side"><div class="brand"><span class="brand-mark">${I.logo}</span><div>${esc(DONO.unidade.nome)}<small>${esc(S.cond.curto)}</small></div></div>
      ${ctx.admin ? `<a class="nav-a" href="#/admin/${indiv() ? 'inicio' : 'unidades'}">${I.back}Painel do proprietário</a><div class="divider" style="margin:6px 0"></div>` : ''}
      ${itens.map(([k,t,ic,b]) => `<a class="nav-a ${at===k?'on':''}" href="${lnk(k)}">${ic}${t}${b?`<span class="badge b">${b}</span>`:''}</a>`).join('')}
      <div style="flex:1"></div><a class="nav-a" href="/" target="_blank">${I.home}Ver o site</a>
      ${ctx.admin ? '' : `<button class="nav-a" data-sair-dono>${I.out}Sair</button>`}</aside>`,
    top:`<div class="topbar mob-only"><div class="topbar-in"><div class="brand"><span class="brand-mark" style="width:34px;height:34px">${I.logo}</span><div style="font-size:14px">${esc(DONO.unidade.nome)}<small>${ctx.admin ? 'Vendo como proprietário' : esc(S.cond.curto)}</small></div></div><div style="display:flex;gap:6px">${botaoTema()}${ctx.admin ? `<a class="btn btn-ghost btn-sm" href="#/admin/unidades">${I.back}</a>` : `<button class="btn btn-ghost btn-sm" data-sair-dono>${I.out}</button>`}</div></div></div>`,
    bottom:`<nav class="bnav">${itens.map(([k,t,ic,b]) => `<button class="${at===k?'on':''}" data-ir="${lnk(k)}">${ic}${t}${b?`<span class="dot b">${b}</span>`:''}</button>`).join('')}</nav>`,
  };
}
function moldura(at, corpo, { largo = false } = {}){
  const n = navDono(at);
  return `<div class="shell">${n.side}<main class="main">${n.top}<div class="wrap-wide" style="max-width:${largo?1100:780}px">
${corpo}</div></main></div>${n.bottom}`;
}
async function telaDono(p, v){
  if (!SD?.token) { location.hash = '#/'; return; }
  await carregarDono(true); // sempre busca o que há de novo (reservas, baixas)
  if (velha(v)) return;
  await paginaDono(p.slice(1));
}
async function paginaDono(sub){
  let pag = sub[0] || '';
  if (indiv() && pag === '') pag = 'temporada';
  if (pag === 'temporada') app.innerHTML = moldura('temporada', paginaTemporada(), { largo:true });
  else if (pag === 'reserva') { app.innerHTML = moldura('temporada', '<div class="carregando"><span class="spin"></span></div>', { largo:true }); await paginaReservaDono(sub[1]); }
  else if (pag === 'dados') app.innerHTML = moldura('dados', paginaDados());
  else app.innerHTML = moldura('', telaParcelas());
  posRender(pag);
}
function posRender(pag){
  if (pag === 'temporada') prepararTemporada();
  if (pag === 'dados') prepararDados();
  if (pag === '') { const w = $('#wallet'); if (w){ w.onscroll = () => { const n = $$('.wdots i').length - 1, i = Math.round(w.scrollLeft / (w.scrollWidth - w.clientWidth || 1) * n); $$('.wdots i').forEach((d,j)=>d.classList.toggle('on', j===i)); }; $$('.wdots i').forEach((d,j) => d.onclick = () => w.scrollTo({ left: j * (w.scrollWidth - w.clientWidth) / Math.max(1, $$('.wdots i').length - 1), behavior:'smooth' })); } }
}

/* ---------------- parcelas da unidade ---------------- */
let estP = { aba:'prox', ano:null, sel:new Set() };
function liItem(u, it, { selecionavel = false, dono = false } = {}){
  const sel = estP.sel.has(it.k);
  const pagavel = !dono && ['vencido','vence','aberto','futuro'].includes(it.st);
  const tag = pagavel || dono ? 'button' : 'div';
  const rec = S.pag[u.id]?.[it.k];
  return `<${tag} class="item ${sel?'sel':''}" ${tag==='button'?`data-it="${it.k}"`:''}>
    ${selecionavel && pagavel ? `<span class="chk" data-chk>${sel?I.check:''}</span>` : ''}
    <div class="gi ${it.g}">${GRUPOS[it.g].ico}</div>
    <div class="mid"><b>${esc(it.titulo)}</b><span>${it.st==='pago' && rec?.conf ? `Baixa em ${fmtD(rec.conf.slice(0,10))}` : `Vence ${fmtD(it.venc)}`}${it.ajustado?' · ajustado':''}</span></div>
    <div class="rt"><b class="mono">${brl(it.valor)}</b><span class="chip st-${it.st}"><i></i>${rotulo(it)}</span></div>
  </${tag}>`;
}
function telaParcelas(){
  const u = S.unidades[0], its = itensDe(u), r = resumo(u, its);
  const pI = r.totalImovel ? Math.round(r.pagoImovel / r.totalImovel * 1000) / 10 : 0;
  const pC = r.devidosC ? Math.round(r.n.C.pagas / r.devidosC * 1000) / 10 : 0;
  const pX = r.totalExtra ? Math.round(r.pagoExtra / r.totalExtra * 1000) / 10 : 0;
  const ymHoje = hoje().slice(0,7);
  const proxC = its.filter(i => i.g === 'C' && !['pago','aguardando'].includes(i.st)).sort((a,b)=>a.venc.localeCompare(b.venc))[0];
  const abertos = its.filter(i => ['vencido','vence','aberto','futuro'].includes(i.st)).sort((a,b)=>a.venc.localeCompare(b.venc));
  const vencidos = abertos.filter(i => i.st === 'vencido');
  const prox = abertos.find(i => i.st !== 'vencido');
  const doMes = prox ? abertos.filter(i => i.st !== 'vencido' && i.venc.slice(0,7) === prox.venc.slice(0,7)) : [];
  const agora = [...vencidos, ...doMes], totAgora = agora.reduce((a,b)=>a+b.valor,0);
  const ab = estP.aba;
  const abas = [['prox','A pagar', vencidos.length], ['M','Mensalidades'], ['C','Condomínio'], ...(r.n.X.total ? [['X','Extras']] : []), ['I','Intermediárias'], ['E','Entrada'], ['pagos','Pagos']];
  let lista = '';
  if (ab === 'prox'){
    lista = agora.length ? `<div class="list">${agora.map(it => liItem(u, it, { selecionavel:true })).join('')}</div>` : `<div class="empty"><b>🎉</b>Nada para pagar agora.</div>`;
    if (r.aguard.length) lista += `<div class="section-t"><h3>Em conferência</h3><span>aguardando o proprietário</span></div><div class="list">${r.aguard.map(it => liItem(u, it)).join('')}</div>`;
  } else if (ab === 'pagos'){
    const pagos = its.filter(i => i.st === 'pago').sort((a,b)=>b.venc.localeCompare(a.venc));
    lista = pagos.length ? `<div class="list">${pagos.map(it => liItem(u, it)).join('')}</div>` : `<div class="empty"><b>🧾</b>Ainda não há parcelas baixadas.</div>`;
  } else {
    const doG = its.filter(i => i.g === ab), anosG = [...new Set(doG.map(i => i.venc.slice(0,4)))];
    let ano = estP.ano; if (!ano || !anosG.includes(ano)) ano = (doG.find(i => i.st !== 'pago') || doG[0] || {venc:'0000'}).venc.slice(0,4);
    estP.ano = ano;
    const mostra = anosG.length > 1 && (ab === 'M' || ab === 'C') ? doG.filter(i => i.venc.startsWith(ano)) : doG;
    const n = r.n[ab];
    lista = `<p class="hint" style="margin-top:12px">${n.pagas} de ${n.total} pagas · ${brl(n.valorPago)} de ${brl(n.valorTotal)}</p>`
      + ((ab === 'M' || ab === 'C') && anosG.length > 1 ? `<div class="years">${anosG.map(a => `<button class="yr ${a===ano?'on':''}" data-ano="${a}">${a}</button>`).join('')}</div>` : '')
      + (ab === 'X' ? (S.extras || []).map(x => `<div class="panel" style="margin-top:10px"><b>🛠️ ${esc(x.nome)}</b>${x.descricao ? `<p class="hint" style="margin-top:4px">${esc(x.descricao)}</p>` : ''}<p class="hint" style="margin-top:4px">Valor da sua unidade: ${brl(x.unidades[u.id])}${x.parcelas > 1 ? ` em ${x.parcelas} parcelas` : ''} · 1º vencimento ${fmtD(x.venc1)}</p></div>`).join('') : '')
      + `<div class="list">${mostra.map(it => liItem(u, it, { selecionavel:true })).join('')}</div>`;
  }
  const sel = [...estP.sel].map(k => its.find(i => i.k === k)).filter(Boolean), totSel = sel.reduce((a,b)=>a+b.valor,0);
  return `
    <p class="h-sub" style="margin:0">Olá 👋</p>
    <h1 class="h-title">${esc(u.nome)}</h1>
    <p class="h-sub">${esc(u.piso)} · ${esc(S.planos[u.tipo].nome)} · ${esc(S.cond.curto)}</p>
    ${DONO.faltaDados?.length && !ctxAtual().admin ? `<a class="alert warn" href="#/dono/dados"><div class="ic">📝</div><div><b>Complete os seus dados</b><br><span class="hint">Eles entram nos contratos de temporada. Toque aqui.</span></div></a>` : ''}
    ${vencidos.length ? `<div class="alert bad"><div class="ic">⚠️</div><div><b>${vencidos.length} parcela${vencidos.length>1?'s':''} em atraso</b><br><span class="hint">Total de ${brl(vencidos.reduce((a,b)=>a+b.valor,0))}. Regularize com Pix abaixo.</span></div></div>` : ''}
    ${r.vence.length ? `<div class="alert warn"><div class="ic">🔔</div><div><b>Vence em breve</b><br><span class="hint">${r.vence.map(i=>esc(i.titulo)).join(', ')} - ${rotulo(r.vence[0]).toLowerCase()}.</span></div></div>` : ''}
    ${r.aguard.length ? `<div class="alert wait"><div class="ic">⏳</div><div><b>${r.aguard.length} pagamento${r.aguard.length>1?'s':''} em conferência</b><br><span class="hint">A baixa aparece aqui assim que o proprietário confirmar.</span></div></div>` : ''}
    <div class="section-t" style="margin-top:20px"><h3>Minha carteira</h3><span class="so-celular">arraste para o lado</span></div>
    <div class="wallet duo" id="wallet">
      <div class="wcard imovel">
        <div class="top"><span class="lbl2">Compra do imóvel</span><span style="font-size:22px">🏠</span></div>
        <div class="big mono">${brl(r.pagoImovel)}</div>
        <div class="small">pagos de ${brl(r.totalImovel)} · faltam ${brl(r.totalImovel - r.pagoImovel)}</div>
        <div class="bar"><i style="width:${pI}%"></i></div>
        <div class="mini"><div><span>Entrada</span><b>${r.n.E.pagas}/${r.n.E.total}</b></div><div><span>Mensais</span><b>${r.n.M.pagas}/${r.n.M.total}</b></div><div><span>Interm.</span><b>${r.n.I.pagas}/${r.n.I.total}</b></div></div>
      </div>
      <div class="wcard condo">
        <div class="top"><span class="lbl2">Condomínio, água e IPTU</span><span style="font-size:22px">🌊</span></div>
        <div class="big mono">${brl(valorCondo(S.planos[u.tipo], ymHoje))}<span style="font-size:20px;opacity:.78"> /mês</span></div>
        <div class="small">Mensal, sem prazo final · desde ${mesAno(S.datas.condo1 + '-01')}</div>
        <div class="bar"><i style="width:${pC}%"></i></div>
        <div class="mini"><div><span>Meses pagos</span><b>${r.n.C.pagas}</b></div><div><span>Em atraso</span><b>${r.vencC}</b></div><div><span>Próximo</span><b>${proxC ? fmtD(proxC.venc).slice(0,5) : '-'}</b></div></div>
      </div>
      ${r.n.X.total ? `<div class="wcard extra">
        <div class="top"><span class="lbl2">Melhorias / Extras</span><span style="font-size:22px">🛠️</span></div>
        <div class="big mono">${brl(r.pagoExtra)}</div>
        <div class="small">pagos de ${brl(r.totalExtra)} · ${(S.extras||[]).map(x => esc(x.nome)).join(', ')}</div>
        <div class="bar"><i style="width:${pX}%"></i></div>
        <div class="mini"><div><span>Cobranças</span><b>${(S.extras||[]).length}</b></div><div><span>Parcelas</span><b>${r.n.X.pagas}/${r.n.X.total}</b></div><div><span>Falta</span><b>${brl(r.totalExtra - r.pagoExtra)}</b></div></div>
      </div>` : ''}
    </div>
    <div class="wdots">${'<i></i>'.repeat(r.n.X.total ? 3 : 2).replace('<i>', '<i class="on">')}</div>
    ${agora.length ? `<div class="section-t"><h3>Pagar agora</h3><span>${prox ? 'próximo vencimento ' + fmtD(prox.venc) : ''}</span></div>
    <div class="next">
      <div class="head"><div><span class="hint">${vencidos.length ? 'Atrasados + próximo vencimento' : 'Parcelas de ' + mesAno(prox.venc)}</span><div class="tot mono" style="margin-top:6px">${brl(totAgora)}</div></div><span class="chip st-${vencidos.length?'vencido':prox.st}"><i></i>${agora.length} parcela${agora.length>1?'s':''}</span></div>
      <div style="margin-top:12px">${agora.slice(0,4).map(it => `<div class="sum-row"><span>${GRUPOS[it.g].ico} ${esc(it.titulo)}</span><b class="mono">${brl(it.valor)}</b></div>`).join('')}${agora.length>4?`<span class="hint">+ ${agora.length-4} parcelas</span>`:''}</div>
      <button class="btn btn-sun btn-block" style="margin-top:14px" data-pagar-agora>${I.pix} Pagar ${brl(totAgora)} com Pix</button>
    </div>` : ''}
    <div class="section-t"><h3>Parcelas</h3><span>toque para pagar · marque várias</span></div>
    <div class="tabs">${abas.map(([k,t,c]) => `<button class="tab ${ab===k?'on':''}" data-aba="${k}">${t}${c?`<span class="cnt">${c}</span>`:''}</button>`).join('')}</div>
    ${lista}
    <div class="divider" style="margin-top:26px"></div>
    <button class="btn btn-ghost btn-block" data-falar-adm>${I.wa} Falar com o proprietário</button>
    ${sel.length ? `<div class="fab-bar"><div class="in"><div style="flex:1"><span class="hint">${sel.length} selecionada${sel.length>1?'s':''}</span><div class="mono" style="font-weight:800;font-size:18px">${brl(totSel)}</div></div><button class="btn btn-ghost btn-sm" data-limpar-sel>Limpar</button><button class="btn btn-sun" data-pagar-sel>${I.pix} Pagar</button></div></div>` : ''}`;
}
function abrirPagamento(keys){
  const u = S.unidades[0];
  const its = itensDe(u).filter(i => keys.includes(i.k) && i.st !== 'pago' && i.st !== 'aguardando');
  if (!its.length) return toast('Essas parcelas já foram informadas ou pagas.');
  const tot = Math.round(its.reduce((a,b)=>a+b.valor,0) * 100) / 100;
  const cod = codigoPix(S.pix, tot, ('LSM' + u.id.toUpperCase() + its.map(i => i.k).join('')).slice(0,25));
  modal(`<h3>Pagar com Pix</h3><p class="hint">${esc(u.nome)} · ${its.length} parcela${its.length>1?'s':''}</p>
    <div style="margin-top:12px">${its.map(it => `<div class="sum-row"><span>${GRUPOS[it.g].ico} ${esc(it.titulo)}<br><span class="hint">vence ${fmtD(it.venc)}</span></span><b class="mono">${brl(it.valor)}</b></div>`).join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px"><span style="font-weight:700">Total</span><span class="mono" style="font-family:var(--fd);font-size:30px">${brl(tot)}</span></div>
    <div class="qr-box">${qrSvg(cod)}</div>
    <p class="hint" style="text-align:center">Recebedor: <b style="color:var(--text)">${esc(S.pix.nome)}</b></p>
    <div class="code" style="margin-top:12px">${esc(cod)}</div>
    <button class="btn btn-sea btn-block" style="margin-top:10px" data-copiar>${I.copy} Copiar código Pix</button>
    <div class="divider"></div>
    <p class="hint">1. Abra o app do seu banco e pague pelo QR Code ou pelo copia e cola.<br>2. Volte aqui e toque em "Já paguei". O proprietário recebe o aviso e confere.</p>
    <button class="btn btn-sun btn-block" style="margin-top:14px" data-japaguei>${I.check} Já paguei - avisar o proprietário</button>
    <button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Pagar depois</button>`, ov => {
    $('[data-copiar]', ov).onclick = () => copiar(cod, 'Código Pix copiado');
    $('[data-japaguei]', ov).onclick = (e) => ocupado(e.currentTarget, async () => {
      const r = await apiDono('informar', { keys: its.map(i => i.k) });
      DONO.parcelas = r.parcelas; S.pag[u.id] = r.parcelas.pag; estP.sel.clear();
      modal(`<div class="okbig">⏳</div><h3 style="text-align:center">Pagamento informado!</h3><p class="hint" style="text-align:center;margin-top:6px">O proprietário confere no banco e dá a baixa. A parcela fica <b>Em conferência</b> até lá.</p>
        ${r.avisado ? '<p class="hint" style="text-align:center;margin-top:14px">✅ O proprietário já foi avisado no WhatsApp.</p>' : `<button class="btn btn-wa btn-block" style="margin-top:18px" data-avisar>${I.wa} Avisar o proprietário no WhatsApp</button>`}
        <button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Fechar</button>`, ov2 => {
        const b = $('[data-avisar]', ov2); if (b) b.onclick = () => { abrirWhats(r.fone, r.texto); fecharModal(); };
      });
      app.innerHTML = moldura('', telaParcelas()); posRender('');
    });
  });
}

/* ---------------- temporada: anúncio, calendário e reservas ---------------- */
let estT = { aba:'reservas', filtro:'ativas', marcados:new Set() };
function paginaTemporada(){
  const a = DONO.anuncio, ctx = ctxAtual();
  const abas = [['reservas','Reservas'], ['calendario','Calendário'], ['anuncio','Anúncio']];
  let corpo = '';
  if (estT.aba === 'reservas'){
    const lista = DONO.reservas.filter(r => estT.filtro === 'todas' || BLOQUEIA.includes(r.status));
    corpo = `<div class="tabs" style="margin-top:12px">${[['ativas','Ativas'],['todas','Todas']].map(([k,t]) => `<button class="tab ${estT.filtro===k?'on':''}" data-filtro="${k}">${t}</button>`).join('')}</div>
      <div class="list">${lista.length ? lista.map(r => `<a class="item" href="${ctx.base}/reserva/${r.id}">
        <div class="gi R">🏖️</div><div class="mid"><b>${esc(r.titular)}</b><span>${fmtD(r.ci)} a ${fmtD(r.co)} · ${r.noites} noite${r.noites>1?'s':''} · ${r.hospedes} hósp. · docs ${r.docsOk}/${r.docsTotal}</span></div>
        <div class="rt"><b class="mono">${brl(r.total)}</b><span class="chip st-${r.status}"><i></i>${STATUS_RES[r.status]}</span></div></a>`).join('') : '<div class="empty"><b>🏖️</b>Nenhuma reserva ainda.</div>'}</div>`;
  } else if (estT.aba === 'calendario'){
    const n = estT.marcados.size;
    corpo = `<div class="panel" style="margin-top:12px"><p class="hint" style="margin-bottom:12px">Toque nos dias para marcar e depois bloqueie ou libere. Dias com reserva abrem a reserva.</p><div id="calDono"></div>
      <div class="cal-leg"><span><i style="background:rgba(122,167,255,.35)"></i>Reserva</span><span><i style="background:rgba(255,93,108,.3)"></i>Bloqueado por você</span><span><i style="outline:2px solid var(--sun);outline-offset:-2px"></i>Marcado</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-bad btn-sm" data-bloq="1" ${n?'':'disabled'}>Bloquear ${n||''} dia${n===1?'':'s'}</button><button class="btn btn-ghost btn-sm" data-bloq="0" ${n?'':'disabled'}>Liberar ${n||''} dia${n===1?'':'s'}</button>${n?'<button class="btn btn-ghost btn-sm" data-desmarcar>Limpar seleção</button>':''}</div></div>`;
  } else {
    const comod = DONO.comodidades;
    corpo = `<form id="fan">
      <div class="plan"><h4>Anúncio ${a.exemplo ? '<span class="pill" style="color:var(--t-warn)">dados de exemplo - edite e salve</span>' : ''}</h4>
        <label class="check"><input type="checkbox" name="ativo" ${a.ativo?'checked':''}> <span><b>Mostrar esta unidade no site</b><br><span class="hint">Desmarque para tirar a unidade da vitrine.</span></span></label>
        <div class="grid3 m1" style="margin-top:14px">
          <div class="field span3"><label>Título</label><input class="inp" name="titulo" value="${esc(a.titulo)}" maxlength="90"></div>
          <div class="field span3"><label>Descrição</label><textarea class="inp" name="descricao" rows="5">${esc(a.descricao)}</textarea></div>
          <div class="field"><label>Máximo de hóspedes (até 5)</label><input class="inp" name="capacidade" inputmode="numeric" value="${a.capacidade}"></div>
          <div class="field"><label>Quartos</label><input class="inp" name="quartos" inputmode="numeric" value="${a.quartos}"></div>
          <div class="field"><label>Camas</label><input class="inp" name="camas" inputmode="numeric" value="${a.camas}"></div>
          <div class="field"><label>Banheiros</label><input class="inp" name="banheiros" inputmode="numeric" value="${a.banheiros}"></div>
          <div class="field"><label>Entrada a partir de</label><input class="inp" name="checkin" type="time" value="${a.checkin}"></div>
          <div class="field"><label>Saída até</label><input class="inp" name="checkout" type="time" value="${a.checkout}"></div>
        </div>
        <div class="field" style="margin-top:14px"><label>O que tem na unidade</label><div class="chips-sel">${Object.entries(comod).map(([k,t]) => `<label><input type="checkbox" name="comod" value="${k}" ${a.comodidades.includes(k)?'checked':''}>${ICONE_COMOD[k]||''} ${esc(t)}</label>`).join('')}</div></div>
      </div>
      <div class="plan"><h4>${I.money} Valores</h4>
        <div class="grid3">
          <div class="field"><label>Diária (R$)</label><input class="inp" name="diaria" inputmode="decimal" value="${a.diaria}"></div>
          <div class="field"><label>Diária sexta e sábado (R$)</label><input class="inp" name="diariaFds" inputmode="decimal" value="${a.diariaFds || ''}" placeholder="igual à diária"></div>
          <div class="field"><label>Mínimo de noites</label><input class="inp" name="minNoites" inputmode="numeric" value="${a.minNoites}"></div>
          <div class="field"><label>Taxa de limpeza (R$)</label><input class="inp" name="limpeza" inputmode="decimal" value="${a.limpeza}"></div>
          <div class="field"><label>Caução / reserva (%)</label><input class="inp" name="sinalPct" inputmode="numeric" value="${a.sinalPct ?? 100}"></div>
        </div>
        <p class="hint" style="margin-top:8px">Caução / reserva é o sinal que o hóspede paga no Pix para garantir as datas. 50 = metade do total; o restante é pago no dia da chegada. Ela é descontada do total e não é devolvida se o hóspede desistir. 100 = paga tudo no Pix.</p>
      </div>
      <div class="plan"><h4>🎁 Datas especiais (pacotes: Natal, Réveillon, Carnaval, feriados)</h4>
        <p class="hint">Nas datas especiais não há diária: o hóspede reserva o período inteiro. O valor é do casal (2 pessoas), mais o valor de cada acompanhante a partir da idade mínima, até 3 acompanhantes (máximo de 5 pessoas). Crianças abaixo da idade mínima não pagam. A limpeza de cada pacote pode ter valor próprio.</p>
        <div id="pacs">${(a.pacotes || []).map(p => linhaPacote(p, a.limpeza)).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" data-addpac>+ Adicionar pacote</button>
      </div>
      <div class="plan"><h4>${I.doc} Regras e contrato</h4>
        <div class="grid2 m1">
          <div class="field"><label>Regras da casa (uma por linha)</label><textarea class="inp" name="regras" rows="6">${esc(a.regras)}</textarea></div>
          <div class="field"><label>Requisitos para reservar (um por linha)</label><textarea class="inp" name="requisitos" rows="6">${esc(a.requisitos)}</textarea></div>
          <div class="field"><label>Política de cancelamento (uma regra por linha)</label><textarea class="inp" name="cancelamento" rows="5">${esc(a.cancelamento)}</textarea></div>
          <div class="field"><label>Cláusulas extras no contrato (opcional)</label><textarea class="inp" name="observacoesContrato" rows="5" placeholder="Ex.: não é permitido levar animais de estimação.">${esc(a.observacoesContrato)}</textarea></div>
        </div>
      </div>
      <div class="plan"><h4>🖼️ Fotos da unidade</h4>
        <p class="hint">Até 12 fotos só desta unidade. Elas aparecem primeiro no anúncio (a primeira é a capa) e depois entram as fotos comuns da pousada.</p>
        <div class="photos">${a.fotos.map((f,i) => `<div class="ph"><img src="${esc(f)}" alt="">${i===0?'<span class="star">capa</span>':`<button type="button" class="star" style="cursor:pointer" data-principal="${esc(f)}">tornar capa</button>`}<button type="button" class="x" data-delfoto="${esc(f)}" aria-label="Remover">✕</button></div>`).join('')}</div>
        <label class="btn btn-ghost btn-sm" style="margin-top:12px">＋ Adicionar fotos<input type="file" accept="image/*" multiple id="upfotos" hidden></label>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-sun" style="flex:1">${I.check} Salvar anúncio</button><a class="btn btn-ghost" href="/#/unidade/${DONO.unidade.slug}" target="_blank">Ver no site</a></div>
    </form>`;
  }
  return `${ctx.admin && !indiv() ? `<p class="hint">Vendo como proprietário</p>` : ''}
    <h1 class="h-title">Temporada</h1><p class="h-sub">${esc(DONO.unidade.nome)} · aluguel por temporada no site</p>
    ${DONO.faltaDados?.length ? `<a class="alert warn" href="${ctx.base}/dados"><div class="ic">📝</div><div><b>Preencha os seus dados para gerar contratos</b><br><span class="hint">Falta: ${esc(DONO.faltaDados.join(', '))}.</span></div></a>` : ''}
    ${!DONO.dados?.pix?.chave ? `<a class="alert warn" href="${ctx.base}/dados"><div class="ic">${I.pix}</div><div><b>Cadastre o Pix para receber as reservas</b><br><span class="hint">Enquanto isso, as reservas usam o Pix do administrador.</span></div></a>` : ''}
    <div class="tabs" style="margin-top:18px">${abas.map(([k,t]) => `<button class="tab ${estT.aba===k?'on':''}" data-taba="${k}">${t}</button>`).join('')}</div>
    ${corpo}`;
}
function linhaEspecial(e = {}){
  return `<div class="esp-row" data-esp><div class="field"><label>Nome</label><input class="inp" data-e="nome" value="${esc(e.nome||'')}" placeholder="Réveillon"></div>
    <div class="field"><label>De</label><input class="inp" type="date" data-e="ini" value="${e.ini||''}"></div><div class="field"><label>Até (última noite)</label><input class="inp" type="date" data-e="fim" value="${e.fim||''}"></div>
    <div class="field"><label>Diária (R$)</label><input class="inp" data-e="diaria" inputmode="decimal" value="${e.diaria||''}"></div><button type="button" class="btn btn-bad btn-sm" data-delesp>Remover</button></div>`;
}
function linhaPacote(p = {}, limpezaPadrao = 60){
  return `<div class="pac-row" data-pac data-id="${esc(p.id || '')}">
    <div class="field span2"><label>Nome</label><input class="inp" data-p="nome" value="${esc(p.nome || '')}" placeholder="Réveillon"></div>
    <div class="field"><label>Entrada</label><input class="inp" type="date" data-p="ini" value="${p.ini || ''}"></div>
    <div class="field"><label>Saída</label><input class="inp" type="date" data-p="fim" value="${p.fim || ''}"></div>
    <div class="field"><label>Hora de entrada</label><input class="inp" type="time" data-p="checkin" value="${p.checkin || '17:00'}"></div>
    <div class="field"><label>Hora de saída</label><input class="inp" type="time" data-p="checkout" value="${p.checkout || '16:00'}"></div>
    <div class="field"><label>Casal (R$)</label><input class="inp" data-p="casal" inputmode="decimal" value="${p.casal || ''}"></div>
    <div class="field"><label>Acompanhante (R$)</label><input class="inp" data-p="acompanhante" inputmode="decimal" value="${p.acompanhante || ''}"></div>
    <div class="field"><label>Limpeza (R$)</label><input class="inp" data-p="limpeza" inputmode="decimal" value="${p.limpeza ?? limpezaPadrao ?? ''}"></div>
    <div class="field"><label>Paga a partir de (anos)</label><input class="inp" data-p="idadeMin" inputmode="numeric" value="${p.idadeMin || 6}"></div>
    <label class="check" style="align-self:end"><input type="checkbox" data-p="ativo" ${p.ativo === false ? '' : 'checked'}> <span>Ativo no site</span></label>
    <button type="button" class="btn btn-bad btn-sm" style="align-self:end" data-delpac>Remover</button></div>`;
}
function noitesReservadas(){
  const m = new Map();
  for (const r of DONO.reservas) if (BLOQUEIA.includes(r.status)) for (const d of noitesEntre(r.ci, r.co)) m.set(d, r);
  return m;
}
function prepararTemporada(){
  const ctx = ctxAtual();
  const redesenhar = () => { app.innerHTML = moldura('temporada', paginaTemporada(), { largo:true }); prepararTemporada(); };
  $$('[data-taba]').forEach(b => b.onclick = () => { estT.aba = b.dataset.taba; redesenhar(); });
  $$('[data-filtro]').forEach(b => b.onclick = () => { estT.filtro = b.dataset.filtro; redesenhar(); });
  const cel = $('#calDono');
  if (cel){
    const res = noitesReservadas();
    new Calendario(cel, { modo:'dono', hoje: hojeLocal(), meses: innerWidth > 760 ? 2 : 1, inicio: estT.calInicio, onNav: (m) => { estT.calInicio = m; }, reservadas: res, bloqueios: new Set(DONO.anuncio.bloqueios || []), marcados: estT.marcados,
      onDia: (d) => { const r = res.get(d); if (r) { location.hash = `${ctx.base}/reserva/${r.id}`; return; } estT.marcados.has(d) ? estT.marcados.delete(d) : estT.marcados.add(d); redesenhar(); } });
    $$('[data-bloq]').forEach(b => b.onclick = () => ocupado(b, async () => {
      const r = await apiDono('bloqueios', { datas:[...estT.marcados], bloquear: b.dataset.bloq === '1' });
      DONO.anuncio = r.anuncio; estT.marcados.clear(); toast(b.dataset.bloq === '1' ? 'Dias bloqueados' : 'Dias liberados'); redesenhar();
    }));
    $('[data-desmarcar]') && ($('[data-desmarcar]').onclick = () => { estT.marcados.clear(); redesenhar(); });
  }
  const f = $('#fan');
  if (f){
    $('[data-addpac]').onclick = () => $('#pacs').insertAdjacentHTML('beforeend', linhaPacote({}, num(f.limpeza.value) || 0));
    f.addEventListener('click', e => { const b = e.target.closest('[data-delpac]'); if (b) b.closest('[data-pac]').remove(); });
    f.onsubmit = e => { e.preventDefault();
      const g = (n) => f[n].value;
      const anuncio = { ativo:f.ativo.checked, titulo:g('titulo'), descricao:g('descricao'), capacidade:num(g('capacidade')), quartos:num(g('quartos')), camas:num(g('camas')), banheiros:num(g('banheiros')),
        checkin:g('checkin'), checkout:g('checkout'), diaria:num(g('diaria')), diariaFds:num(g('diariaFds')) || 0, minNoites:num(g('minNoites')), limpeza:num(g('limpeza')) || 0, caucao:0,
        regras:g('regras'), requisitos:g('requisitos'), cancelamento:g('cancelamento'), observacoesContrato:g('observacoesContrato'),
        comodidades: $$('[name=comod]:checked', f).map(x => x.value),
        especiais: [],
        sinalPct: Math.round(num(g('sinalPct'))) || 100,
        pacotes: $$('[data-pac]', f).map(r => { const v = (k) => $(`[data-p=${k}]`, r); return { id:r.dataset.id || '', nome:v('nome').value.trim(), ini:v('ini').value, fim:v('fim').value, checkin:v('checkin').value, checkout:v('checkout').value, casal:num(v('casal').value), acompanhante:num(v('acompanhante').value) || 0, limpeza:num(v('limpeza').value) || 0, idadeMin:Math.round(num(v('idadeMin').value)) || 6, ativo:v('ativo').checked }; }).filter(p => p.nome || p.ini || p.fim || p.casal) };
      if (!(anuncio.diaria > 0)) return toast('Informe o valor da diária.');
      if (anuncio.sinalPct < 1 || anuncio.sinalPct > 100) return toast('O sinal vai de 1 a 100%.');
      for (const p of anuncio.pacotes){
        if (!p.ini || !p.fim || p.fim <= p.ini) return toast(`Pacote ${p.nome || ''}: a saída precisa ser depois da entrada.`);
        if (!(p.casal > 0)) return toast(`Pacote ${p.nome || ''}: informe o valor do casal.`);
      }
      ocupado(e.submitter, async () => { const r = await apiDono('anuncio', { anuncio }); DONO.anuncio = r.anuncio; toast('✅ Anúncio salvo'); redesenhar(); });
    };
    $('#upfotos').onchange = async (e) => {
      const fs = [...e.target.files];
      for (const [i, file] of fs.entries()){
        try { toast(`Enviando foto ${i+1} de ${fs.length}...`); const a = await prepararArquivo(file, { maxLado:1800, qualidade:.82 }); const r = await apiDono('foto', { dados:a.dados, tipo:a.tipo }); DONO.anuncio = r.anuncio; }
        catch(err){ toast(err.message); break; }
      }
      redesenhar();
    };
    f.addEventListener('click', e => {
      const del = e.target.closest('[data-delfoto]'), pr = e.target.closest('[data-principal]');
      if (del && confirm('Remover esta foto?')) ocupado(null, async () => { const r = await apiDono('removerFoto', { url: del.dataset.delfoto }); DONO.anuncio = r.anuncio; redesenhar(); });
      if (pr) ocupado(null, async () => { const r = await apiDono('fotoPrincipal', { url: pr.dataset.principal }); DONO.anuncio = r.anuncio; redesenhar(); });
    });
  }
}

/* ---------------- detalhe da reserva ---------------- */
async function paginaReservaDono(id){
  const ctx = ctxAtual();
  const v0 = versao;
  const d = await apiDono('reserva', { id }, true);
  if (velha(v0)) return;
  const r = d.reserva, st = r.status, v = r.valores, c = r.contrato, integ = d.integracoes;
  const pessoas = [{ nome:r.titular.nome, doc:`CPF ${r.titular.cpf} · RG ${r.titular.rg}`, nasc:r.titular.nascimento }, ...r.acompanhantes.map(a => ({ nome:a.nome, doc:a.documento, nasc:a.nascimento }))];
  const docsOk = r.docs.filter(x => x?.completo).length;
  const vistoriaAberta = !['cancelada','expirada'].includes(st);
  let acoes = '';
  if (st === 'pre' || st === 'pago_informado'){
    acoes = `<div class="panel" style="margin-top:14px">
      <b>${st === 'pre' ? 'Aguardando o Pix do hóspede' : '💰 O hóspede informou o Pix'}</b>
      <p class="hint" style="margin-top:4px">Confira no banco se entrou ${brl(v.sinal ?? v.total)} de ${esc(r.titular.nome)}${r.pixDoAdmin ? ' (Pix do administrador)' : ''}${v.restante > 0 ? ` (sinal de ${v.sinalPct}%; o restante de ${brl(v.restante)} é pago na chegada)` : ''}. Ao confirmar, o contrato é gerado.</p>
      <div class="field" style="margin-top:12px"><label>Assinatura do contrato</label><div class="radio">
        <label><input type="radio" name="met" value="aceite" ${S.assinatura === 'aceite' && integ.papi ? 'checked' : ''} ${integ.papi ? '' : 'disabled'}><span><b>Aceite por código</b><br><span class="hint">${integ.papi ? 'O hóspede aceita com um código enviado ao WhatsApp dele e você aceita aqui no painel' : 'Precisa do WhatsApp automático (PAPI) ligado'}</span></span></label>
        <label><input type="radio" name="met" value="autentique" ${integ.autentique && S.assinatura !== 'govbr' && !(S.assinatura === 'aceite' && integ.papi) ? 'checked' : ''} ${integ.autentique ? '' : 'disabled'}><span><b>Autentique</b><br><span class="hint">${integ.autentique ? 'Link para assinar no celular, automático' + (integ.autentiqueTeste ? ' (modo de teste)' : '') : 'Ainda não ligada na Vercel'}</span></span></label>
        <label><input type="radio" name="met" value="govbr" ${(!integ.autentique || S.assinatura === 'govbr') && !(S.assinatura === 'aceite' && integ.papi) ? 'checked' : ''}><span><b>gov.br</b><br><span class="hint">Grátis: cada um assina o PDF no gov.br</span></span></label>
      </div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-ok" data-confirmar>${I.check} Pagamento recebido · confirmar</button><button class="btn btn-bad" data-cancelar>Não recebi · cancelar</button></div></div>`;
  } else if (['confirmada','assinatura','assinado'].includes(st)){
    const aut = c?.autentique;
    acoes = `<div class="panel" style="margin-top:14px"><b>📄 Contrato</b>
      ${c?.pdf ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a class="btn btn-ghost btn-sm" href="${c.pdf}" target="_blank">${I.doc} Contrato (PDF)</a>${st !== 'assinado' ? `<button class="btn btn-ghost btn-sm" data-regerar>Gerar de novo</button>` : ''}${c.final ? `<a class="btn btn-ok btn-sm" href="${c.final}&baixar=1" target="_blank">${I.doc} Contrato assinado</a>` : ''}</div>` : `<p class="hint" style="margin-top:6px">O contrato ainda não foi gerado.</p><button class="btn btn-sun btn-sm" style="margin-top:8px" data-regerar>Gerar contrato</button>`}
      ${st === 'assinado' ? '<div class="alert ok"><div class="ic">🎉</div><div><b>Contrato assinado pelas duas partes.</b></div></div>' : ''}
      ${st !== 'assinado' && c?.pdf && c.metodo === 'aceite' ? `
        <div class="divider"></div><b>Aceite eletrônico por código</b>
        <div class="sum-row"><span>Você (locador)</span><span>${c.aceite?.locador ? `✅ aceitou em ${fmtDH(c.aceite.locador.em)}` : `<button class="btn btn-sun btn-sm" data-aceitelocador>${I.pen} Aceitar como locador</button>`}</span></div>
        <div class="sum-row"><span>${esc(r.titular.nome)} (locatário)</span><span>${c.aceite?.locatario ? `✅ aceitou em ${fmtDH(c.aceite.locatario.em)}` : `<button class="btn btn-ghost btn-sm" data-enviarlinkaceite>${I.wa} Enviar link</button>`}</span></div>
        <p class="hint" style="margin-top:6px">O hóspede abre a página da reserva, lê o contrato e confirma com o código que chega no WhatsApp dele. Quando os dois aceitarem, o PDF final sai com a página de comprovação (data, hora, IP e código de integridade).</p>
        <button class="back" style="margin-top:8px" data-metodo="govbr">Mudar para gov.br</button>`
      : st !== 'assinado' && c?.pdf ? (c.metodo === 'autentique' ? (aut ? `
        <div class="divider"></div><b>Assinatura pela Autentique${aut.teste ? ' <span class="pill" style="color:var(--t-warn)">teste</span>' : ''}</b>
        <div class="sum-row"><span>Você (locador)</span><span>${aut.assinados.locador ? '✅ assinou' : `<a class="btn btn-sun btn-sm" href="${esc(aut.links[0])}" target="_blank">${I.pen} Assinar agora</a>`}</span></div>
        <div class="sum-row"><span>${esc(r.titular.nome)} (locatário)</span><span>${aut.assinados.locatario ? '✅ assinou' : `<button class="btn btn-ghost btn-sm" data-enviarlink>${I.wa} Enviar link</button>`}</span></div>
        ${aut.recusa ? `<div class="alert bad"><div class="ic">✖️</div><div>${esc(aut.recusa.nome)} recusou: ${esc(aut.recusa.motivo || 'sem motivo')}</div></div>` : ''}
        <button class="btn btn-ghost btn-sm" style="margin-top:10px" data-atualizar>Atualizar assinaturas</button>`
        : `<div class="divider"></div><button class="btn btn-sun" data-autentique ${integ.autentique?'':'disabled'}>${I.pen} Enviar para assinatura (Autentique)</button>`)
      : `<div class="divider"></div><b>Assinatura pelo gov.br</b>
        <p class="hint" style="margin-top:4px">${c.inquilinoGovbr ? `✅ O hóspede enviou o PDF assinado em ${fmtDH(c.inquilinoGovbrEm)}. Baixe, assine também em <b>assinador.iti.br</b> e envie o arquivo final abaixo.` : 'O hóspede baixa o PDF na página da reserva, assina no gov.br e envia de volta. Depois você assina o mesmo arquivo e envia aqui.'}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${c.inquilinoGovbr ? `<a class="btn btn-ghost btn-sm" href="${c.inquilinoGovbr}" target="_blank">${I.doc} PDF assinado pelo hóspede</a>` : ''}<a class="btn btn-ghost btn-sm" href="https://assinador.iti.br" target="_blank" rel="noopener">Abrir assinador gov.br</a><label class="btn btn-sun btn-sm">${I.up} Enviar contrato assinado por todos<input type="file" accept="application/pdf" id="upfinal" hidden></label></div>
        ${integ.autentique ? '<button class="back" style="margin-top:10px" data-metodo="autentique">Mudar para Autentique</button>' : ''}${integ.papi ? '<button class="back" style="margin-top:10px;margin-left:12px" data-metodo="aceite">Mudar para aceite por código</button>' : ''}`) : ''}
    </div>`;
  }
  const rest = r.restante || {}, temRest = v.restante > 0, podeRest = temRest && !rest.recebidoEm && ['confirmada','assinatura','assinado'].includes(st);
  if (podeRest && rest.informadoEm) acoes = `<div class="alert wait" style="margin-top:14px"><div class="ic">💰</div><div><b>O hóspede informou o Pix do restante (${brl(v.restante)})</b><br><span class="hint">Em ${fmtDH(rest.informadoEm)}. Confira no banco.</span><br><button class="btn btn-ok btn-sm" style="margin-top:8px" data-restrec>${I.check} Restante recebido</button></div></div>` + acoes;
  const corpo = `<a class="back" href="${ctx.base}/temporada">${I.back} Reservas</a>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px"><h1 class="h-title">Reserva ${esc(r.id)}</h1><span class="chip st-${st}"><i></i>${esc(r.nomeStatus)}</span></div>
    <p class="h-sub">${fmtD(r.ci)} a ${fmtD(r.co)} · ${v.noites} noite${v.noites>1?'s':''} · ${r.hospedes} hóspede${r.hospedes>1?'s':''}</p>
    ${d.aviso ? `<div class="alert warn"><div class="ic">⚠️</div><div>${esc(d.aviso)}</div></div>` : ''}
    ${acoes}
    <div class="section-t"><h3>Hóspede titular</h3></div>
    <div class="panel"><div class="kv">
      <span>Nome</span><b>${esc(r.titular.nome)}</b><span>CPF</span><div>${esc(r.titular.cpf)}</div><span>RG</span><div>${esc(r.titular.rg)}</div>
      <span>Nascimento</span><div>${fmtD(r.titular.nascimento)}</div><span>Qualificação</span><div>${esc([r.titular.nacionalidade, r.titular.estadoCivil, r.titular.profissao].join(', '))}</div>
      <span>Endereço</span><div>${esc(r.titular.endereco)}</div><span>E-mail</span><div>${esc(r.titular.email)}</div><span>WhatsApp</span><div>${esc(r.titular.whats)}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-wa btn-sm" data-falar>${I.wa} Falar com o hóspede</button><button class="btn btn-ghost btn-sm" data-linkres>${I.copy} Link da reserva do hóspede</button></div></div>
    <div class="section-t"><h3>Hóspedes e documentos</h3><span>${docsOk} de ${r.hospedes} completos</span></div>
    <div class="list">${pessoas.map((p, i) => { const dc = r.docs[i]; return `<div class="slot ${dc?.completo ? 'ok' : ''}"><span class="ic">${dc?.completo ? '🪪' : '⏳'}</span><span class="mid"><b>${esc(p.nome)}</b><span>${esc(p.doc)} · nasc. ${fmtD(p.nasc)}${dc ? ` · ${esc(dc.tipoDoc)}` : ''}</span></span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${dc?.inteiro ? `<a class="btn btn-ghost btn-sm" href="${dc.inteiro.url}" target="_blank">Documento completo</a>`
        : !dc?.frente && i > 0 ? '<span class="chip st-futuro"><i></i>sem documento (opcional)</span>'
        : `${dc?.frente ? `<a class="btn btn-ghost btn-sm" href="${dc.frente.url}" target="_blank">Frente</a>` : '<span class="chip st-pre"><i></i>falta frente</span>'}${dc?.verso ? `<a class="btn btn-ghost btn-sm" href="${dc.verso.url}" target="_blank">Verso</a>` : (dc?.frente && !dc.precisaVerso ? '' : '<span class="chip st-pre"><i></i>falta verso</span>')}`}</span></div>`; }).join('')}</div>
    <div class="section-t"><h3>${I.cam} Fotos do imóvel (vistoria)</h3><span>${(r.vistoria||[]).length} foto${(r.vistoria||[]).length===1?'':'s'}</span></div>
    <div class="panel" id="vistoria"><p class="hint">Fotos de como a unidade estava na entrada e na saída. O hóspede também pode enviar pela página da reserva.</p>${vistoriaHtml(r.vistoria || [], 'dono', vistoriaAberta)}</div>
    <div class="section-t"><h3>Valores</h3></div>
    <div class="panel">
      ${v.pacote ? `<div class="sum-row"><span>Pacote ${esc(v.pacote.nome)} (casal) · ${v.noites} noites</span><span class="mono">${brl(v.pacote.casal)}</span></div>
        ${v.pacote.acompanhantes ? `<div class="sum-row"><span>${v.pacote.acompanhantes} acompanhante${v.pacote.acompanhantes>1?'s':''} x ${brl(v.pacote.acompanhante)}</span><span class="mono">${brl(v.pacote.acompanhante * v.pacote.acompanhantes)}</span></div>` : ''}`
        : v.diarias.map(x => `<div class="sum-row"><span>Noite de ${fmtD(x.data)}</span><span class="mono">${brl(x.valor)}</span></div>`).join('')}
      ${v.limpeza ? `<div class="sum-row"><span>Limpeza</span><span class="mono">${brl(v.limpeza)}</span></div>` : ''}
      ${v.caucao ? `<div class="sum-row"><span>Caução (devolver após a saída)</span><span class="mono">${brl(v.caucao)}</span></div>` : ''}
      ${temRest ? `<div class="sum-row"><b>Total</b><b class="mono">${brl(v.total)}</b></div>
        <div class="sum-row"><span>Sinal de ${v.sinalPct}% (Pix da reserva)</span><b class="mono">${brl(v.sinal)}</b></div>
        <div class="sum-row"><span>Restante na chegada ${rest.recebidoEm ? `<span class="chip st-assinado"><i></i>recebido ${fmtDH(rest.recebidoEm)}</span>` : rest.informadoEm ? '<span class="chip st-pago_informado"><i></i>Pix informado</span>' : '<span class="chip st-pre"><i></i>a receber</span>'}</span><b class="mono">${brl(v.restante)}</b></div>
        ${podeRest ? `<button class="btn btn-ok btn-sm" style="margin-top:8px" data-restrec>${I.check} Restante recebido</button>` : ''}`
        : `<div class="sum-row"><b>Total recebido por Pix</b><b class="mono">${brl(v.total)}</b></div>`}
      <p class="hint" style="margin-top:6px">Pix para ${esc(r.pix.nome)} · chave ${esc(r.pix.chave)} · identificador ${esc(r.txid)}</p>
    </div>
    <div class="section-t"><h3>Histórico</h3></div>
    <div class="panel">${(r.historico || []).map(h => `<div class="sum-row"><span>${esc(h.txt)}</span><span class="hint">${fmtDH(h.em)}</span></div>`).join('')}</div>
    ${!['cancelada','expirada','pre','pago_informado'].includes(st) ? `<button class="btn btn-bad btn-sm" style="margin-top:18px" data-cancelar>Cancelar reserva</button>` : ''}`;
  app.innerHTML = moldura('temporada', corpo, { largo:true });
  const recarregar = async (x) => { if (x?.reserva) { DONO = null; await carregarDono(true); } await paginaReservaDono(id); if (x?.aviso) toast(x.aviso); };
  const fone = r.titular.whats;
  $('[data-falar]').onclick = () => abrirWhats(fone, `Olá, ${r.titular.nome.split(' ')[0]}! Aqui é sobre a sua reserva ${r.id} no ${S.cond.nome} (${fmtD(r.ci)} a ${fmtD(r.co)}). `);
  $('[data-linkres]').onclick = () => copiar(d.linkHospede, 'Link da reserva copiado');
  $('[data-confirmar]') && ($('[data-confirmar]').onclick = (e) => ocupado(e.currentTarget, async () => {
    const met = $('input[name=met]:checked')?.value || 'govbr';
    const x = await apiDono('confirmar', { id, metodo:met });
    toast('✅ Reserva confirmada');
    if (!integ.papi) setTimeout(() => modal(`<div class="okbig">✅</div><h3 style="text-align:center">Reserva confirmada</h3><p class="hint" style="text-align:center">Mande para o hóspede o link da reserva. Por ele ele vê o contrato e assina.</p><button class="btn btn-wa btn-block" style="margin-top:16px" data-av>${I.wa} Enviar ao hóspede</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Fechar</button>`,
      ov => { $('[data-av]', ov).onclick = () => { abrirWhats(fone, `✅ *Reserva confirmada!*\n\n🏠 ${DONO.unidade.nome} - ${S.cond.nome}\n📅 ${fmtD(r.ci)} a ${fmtD(r.co)}\n\n📄 O contrato está pronto. Leia e assine por aqui:\n${d.linkHospede}`); fecharModal(); }; }), 300);
    await recarregar(x);
  }));
  $$('[data-cancelar]').forEach(b => b.onclick = () => modal(`<h3>Cancelar reserva</h3><p class="hint">As datas voltam a ficar livres no site.</p>
    <div class="field" style="margin-top:12px"><label>Motivo (o hóspede vê)</label><input class="inp" id="mot" placeholder="Ex.: Pix não identificado"></div>
    ${integ.papi ? '<label class="check" style="margin-top:12px"><input type="checkbox" id="avs" checked> Avisar o hóspede no WhatsApp</label>' : ''}
    <button class="btn btn-bad btn-block" style="margin-top:16px" data-ok>Cancelar reserva</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Voltar</button>`, ov => {
    $('[data-ok]', ov).onclick = (e) => ocupado(e.currentTarget, async () => {
      const motivo = $('#mot', ov).value; const x = await apiDono('cancelar', { id, motivo, avisar: !!$('#avs', ov)?.checked }); fecharModal(); toast('Reserva cancelada');
      if (!integ.papi) abrirWhats(fone, `Olá, ${r.titular.nome.split(' ')[0]}.\n\nSua reserva ${r.id} (${DONO.unidade.nome}, ${fmtD(r.ci)} a ${fmtD(r.co)}) foi cancelada.${motivo ? `\nMotivo: ${motivo}` : ''}`);
      await recarregar(x);
    });
  }));
  $$('[data-restrec]').forEach(b => b.onclick = (e) => { if (confirm(`Confirmar que recebeu o restante de ${brl(v.restante)}?`)) ocupado(e.currentTarget, async () => { const x = await apiDono('restanteRecebido', { id }); toast('✅ Restante recebido'); await recarregar(x); }); });
  $('[data-regerar]') && ($('[data-regerar]').onclick = (e) => ocupado(e.currentTarget, async () => { const x = await apiDono('contrato', { id }); toast('Contrato gerado'); await recarregar(x); }));
  $('[data-autentique]') && ($('[data-autentique]').onclick = (e) => ocupado(e.currentTarget, async () => { const x = await apiDono('autentique', { id }); toast('Enviado para a Autentique'); await recarregar(x); }));
  $('[data-atualizar]') && ($('[data-atualizar]').onclick = (e) => ocupado(e.currentTarget, async () => { const x = await apiDono('atualizar', { id }); await recarregar(x); toast('Atualizado'); }));
  $$('[data-metodo]').forEach(b => b.onclick = (e) => ocupado(e.currentTarget, async () => { const x = await apiDono('metodo', { id, metodo: e.currentTarget.dataset.metodo }); await recarregar(x); }));
  $('[data-aceitelocador]') && ($('[data-aceitelocador]').onclick = (e) => { if (confirm('Você leu o contrato e aceita todas as cláusulas como LOCADOR? O aceite fica registrado com data, hora e IP.')) ocupado(e.currentTarget, async () => { const x = await apiDono('aceiteLocador', { id }); toast(x.reserva.status === 'assinado' ? '✅ Contrato assinado pelas duas partes' : '✅ Seu aceite foi registrado'); await recarregar(x); }); });
  $('[data-enviarlinkaceite]') && ($('[data-enviarlinkaceite]').onclick = () => enviarWhats(fone, `✍️ *Contrato pronto para aceite*\n\nOlá, ${r.titular.nome.split(' ')[0]}! Seu contrato de locação por temporada está pronto.\n\nLeia e confirme com o código que chega no seu WhatsApp:\n${d.linkHospede}`, { quem:'dono' }));
  $('[data-enviarlink]') && ($('[data-enviarlink]').onclick = () => enviarWhats(fone, `✍️ *Assinatura do contrato*\n\nOlá, ${r.titular.nome.split(' ')[0]}! Seu contrato de locação por temporada está pronto.\n\nToque no link para ler e assinar:\n${c.autentique.links[1]}`, { quem:'dono' }));
  prepararVistoria($('#vistoria'), (c2) => apiDono('vistoria', { id, ...c2 }), (idx) => apiDono('removerVistoria', { id, idx }), () => paginaReservaDono(id));
  const up = $('#upfinal');
  up && (up.onchange = async () => { const file = up.files[0]; if (!file) return; if (file.type !== 'application/pdf') return toast('Envie o PDF.');
    try { const a = await prepararArquivo(file, { maxMB:4 }); toast('Enviando...'); const x = await apiDono('govbrFinal', { id, dados:a.dados }); toast('✅ Contrato final salvo'); await recarregar(x); } catch(e){ toast(e.message); } });
}

/* ---------------- meus dados ---------------- */
function paginaDados(){
  const d = DONO.dados || {}, ctx = ctxAtual(), p = d.pix || {};
  const civis = ['solteiro(a)','casado(a)','divorciado(a)','viúvo(a)','união estável'];
  return `${ctx.admin ? `<p class="hint">Vendo como proprietário</p>` : ''}
    <h1 class="h-title">${ctx.admin && !indiv() ? 'Dados do dono' : 'Meus dados'}</h1>
    <p class="h-sub">${indiv() ? 'Estes dados entram como LOCADOR nos contratos de temporada de todas as suas unidades, e o Pix recebe o sinal e o restante das reservas.' : 'Estes dados entram como LOCADOR nos contratos de temporada desta unidade.'}</p>
    <form id="fdados">
      <div class="plan"><h4>${I.user} Dados pessoais</h4>
        <div class="grid3 m1">
          <div class="field span2"><label>Nome completo</label><input class="inp" name="nome" value="${esc(d.nome)}"></div>
          <div class="field"><label>CPF</label><input class="inp" name="cpf" inputmode="numeric" value="${esc(d.cpf)}"></div>
          <div class="field"><label>RG</label><input class="inp" name="rg" value="${esc(d.rg)}"></div>
          <div class="field"><label>Nacionalidade</label><input class="inp" name="nacionalidade" value="${esc(d.nacionalidade || 'brasileiro(a)')}"></div>
          <div class="field"><label>Estado civil</label><select class="inp" name="estadoCivil"><option value="">Escolha</option>${civis.map(c => `<option ${d.estadoCivil===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Profissão</label><input class="inp" name="profissao" value="${esc(d.profissao)}"></div>
          <div class="field span2"><label>E-mail</label><input class="inp" name="email" type="email" value="${esc(d.email)}"></div>
          <div class="field span3"><label>Endereço completo</label><input class="inp" name="endereco" value="${esc(d.endereco)}"></div>
          <div class="field"><label>WhatsApp</label><input class="inp" name="whats" inputmode="tel" value="${esc(d.whats)}"></div>
        </div>
      </div>
      <div class="plan"><h4>${I.pix} Pix para receber as reservas</h4>
        <div class="grid3 m1">
          <div class="field span3"><label>Cole um Pix copia e cola seu (eu preencho os campos)</label><input class="inp" id="pxcola" placeholder="00020126..."></div>
          <div class="field span2"><label>Chave Pix</label><input class="inp" name="pxchave" value="${esc(p.chave)}"></div>
          <div class="field"><label>Nome do recebedor</label><input class="inp" name="pxnome" maxlength="25" value="${esc(p.nome)}"></div>
          <div class="field"><label>Cidade</label><input class="inp" name="pxcidade" maxlength="15" value="${esc(p.cidade)}"></div>
        </div>
      </div>
      <button class="btn btn-sun btn-block" style="margin-top:16px">${I.check} Salvar dados</button>
    </form>
    ${ctx.admin ? '' : `<div class="plan"><h4>${I.lock} Trocar senha</h4><form id="fsenha" class="grid2 m1">
      <div class="field"><label>Senha atual</label><input class="inp" type="password" id="sa" autocomplete="current-password"></div>
      <div class="field"><label>Nova senha</label><input class="inp" type="password" id="sn" autocomplete="new-password"></div>
      <div class="span2"><button class="btn btn-ghost">Trocar senha</button></div></form></div>`}`;
}
function prepararDados(){
  const f = $('#fdados');
  f.cpf.oninput = e => { e.target.value = mascaraCPF(e.target.value); };
  f.whats.oninput = e => { e.target.value = mascaraFone(e.target.value); };
  $('#pxcola').oninput = e => { const r = lerPixCola(e.target.value); if (!r) return; f.pxchave.value = r.chave; f.pxnome.value = r.nome; f.pxcidade.value = r.cidade; toast('Pix lido: confira e salve'); };
  f.onsubmit = e => { e.preventDefault();
    const g = (n) => f[n].value.trim();
    const dados = { nome:g('nome'), cpf:g('cpf'), rg:g('rg'), nacionalidade:g('nacionalidade'), estadoCivil:g('estadoCivil'), profissao:g('profissao'), email:g('email'), endereco:g('endereco'), whats:g('whats'), pix:{ chave:g('pxchave'), nome:g('pxnome'), cidade:g('pxcidade') } };
    ocupado(e.submitter, async () => { const r = await apiDono('dados', { dados }); DONO.dados = r.dados; DONO.faltaDados = r.faltaDados; toast(r.faltaDados.length ? 'Salvo. Ainda falta: ' + r.faltaDados.join(', ') : '✅ Dados salvos'); });
  };
  const fs = $('#fsenha');
  fs && (fs.onsubmit = e => { e.preventDefault(); if ($('#sn').value.length < 6) return toast('A nova senha precisa ter 6 caracteres ou mais.');
    ocupado(e.submitter, async () => { await apiDono('senha', { atual:$('#sa').value, nova:$('#sn').value }); fs.reset(); toast('✅ Senha trocada'); }); });
}

/* =========================================================
   PAINEL DO PROPRIETÁRIO
   ========================================================= */
async function carregarAdmin(){
  const d = await apiAdmin('estado', {}, true);
  ADM = d;
  S = { ...d.config, pag:{}, ajuste:{}, avisos:{} };
  for (const [uid, x] of Object.entries(d.pags)){ S.pag[uid] = x.pag || {}; S.ajuste[uid] = x.ajuste || {}; S.avisos[uid] = x.avisos || {}; }
}
function aplicarUnidade(uid, parcelas){ S.pag[uid] = parcelas.pag || {}; S.ajuste[uid] = parcelas.ajuste || {}; S.avisos[uid] = parcelas.avisos || {}; ADM.pags[uid] = parcelas; }
function telaLoginAdmin(){
  app.innerHTML = `<div class="login"><div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center">${indiv() ? `<a class="back" href="/">${I.back} Site</a>` : `<a class="back" href="#/">${I.back} Área do dono</a>`}${botaoTema()}</div>
    <div style="display:flex;align-items:center;gap:12px;margin:18px 0 6px"><span class="brand-mark">${I.logo}</span><div><h1 class="h-title" style="font-size:24px">Painel do proprietário</h1><p class="h-sub" style="margin:0">Lua Sol e Mar</p></div></div>
    <form id="flogin" style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
      <div class="field"><label>Senha</label><input class="inp" type="password" id="senha" autocomplete="current-password" autofocus></div>
      <button class="btn btn-sun">${I.lock} Entrar</button>
    </form>
    <button class="back" style="margin-top:14px" data-esq>Esqueci a senha</button>
  </div></div>`;
  $('#flogin').onsubmit = e => { e.preventDefault(); ocupado(e.submitter, async () => {
    const r = await api('/api/admin', { corpo:{ acao:'login', senha:$('#senha').value } });
    SA = { token:r.token }; gravarJ('lsm_admin', SA); await render();
    if (r.deveTrocar) pedirNovaSenha(true);
  }); };
  $('[data-esq]').onclick = (e) => ocupado(e.currentTarget, async () => {
    const r = await api('/api/admin', { corpo:{ acao:'esqueci' } });
    if (!r.ok) return modal(`<h3>Esqueci a senha</h3><p class="hint" style="margin-top:8px">${esc(r.mensagem)}</p><button class="btn btn-ghost btn-block" style="margin-top:16px" data-fechar>Entendi</button>`);
    modal(`<h3>Nova senha</h3><p class="hint">${esc(r.mensagem)}</p><form id="fred" style="display:flex;flex-direction:column;gap:12px;margin-top:14px">
      <div class="field"><label>Código</label><input class="inp" id="rc" inputmode="numeric" maxlength="6"></div>
      <div class="field"><label>Nova senha (mínimo 6)</label><input class="inp" type="password" id="rn"></div><button class="btn btn-sun">Salvar e entrar</button></form>`, ov => {
      $('#fred', ov).onsubmit = ev => { ev.preventDefault(); ocupado(ev.submitter, async () => { const x = await api('/api/admin', { corpo:{ acao:'redefinir', codigo:$('#rc', ov).value, nova:$('#rn', ov).value } }); SA = { token:x.token }; gravarJ('lsm_admin', SA); fecharModal(); toast('✅ Senha trocada'); render(); }); };
    });
  });
}
function pedirNovaSenha(obrigatorio){
  modal(`<h3>${obrigatorio ? 'Crie a sua senha' : 'Trocar senha'}</h3><p class="hint">${obrigatorio ? 'Você entrou com a senha provisória. Crie uma senha só sua para continuar.' : ''}</p>
    <form id="fns" style="display:flex;flex-direction:column;gap:12px;margin-top:14px">
      <div class="field"><label>Nova senha (mínimo 6)</label><input class="inp" type="password" id="n1" autocomplete="new-password"></div>
      <div class="field"><label>Repita</label><input class="inp" type="password" id="n2" autocomplete="new-password"></div>
      <button class="btn btn-sun">Salvar senha</button>${obrigatorio ? '' : '<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>'}</form>`, ov => {
    if (obrigatorio) ov.onclick = null;
    $('#fns', ov).onsubmit = e => { e.preventDefault(); if ($('#n1', ov).value.length < 6) return toast('Mínimo de 6 caracteres.'); if ($('#n1', ov).value !== $('#n2', ov).value) return toast('As senhas não são iguais.');
      ocupado(e.submitter, async () => { await apiAdmin('senha', { nova:$('#n1', ov).value }); ADM.deveTrocar = false; fecharModal(); toast('✅ Senha salva'); }); };
  });
}
function navAdmin(at){
  const pend = ADM.reservas.filter(r => r.status === 'pago_informado').length;
  let itens, noMenuDeBaixo;
  if (indiv()){
    itens = [['inicio','Início',I.grid, pend, 'b'],['temporada','Reservas',I.beach, pend, 'b'],['unidades','Unidades',I.home],['anuncios','Anúncios',I.mais],['dados','Meus dados',I.user],['ajustes','Ajustes',I.gear]];
    noMenuDeBaixo = ['inicio','temporada','unidades','anuncios'];
  } else {
    const G = dadosGerais();
    itens = [['inicio','Início',I.grid],['conferir','Conferir',I.check, G.aguard, 'b'],['unidades','Unidades',I.home],['avisos','Avisos',I.bell, G.avisos],['temporada','Temporada',I.beach, pend, 'b'],['anuncios','Anúncios',I.mais],['extras','Extras',I.tool],['valores','Valores',I.money],['ajustes','Ajustes',I.gear]];
    noMenuDeBaixo = ['inicio','conferir','unidades','avisos','temporada'];
  }
  const marca = indiv() ? esc(ADM.config.site?.marca || 'Meu site') : 'Lua Sol e Mar';
  return {
    side:`<aside class="side"><div class="brand"><span class="brand-mark">${I.logo}</span><div>${marca}<small>Painel do proprietário</small></div></div>
      ${itens.map(([k,t,ic,b,cl]) => `<a class="nav-a ${at===k?'on':''}" href="#/admin/${k}">${ic}${t}${b?`<span class="badge ${cl||''}">${b}</span>`:''}</a>`).join('')}
      <div style="flex:1"></div><div style="padding:0 6px">${botaoTema()}</div><a class="nav-a" href="/" target="_blank">${I.home}Ver o site</a><button class="nav-a" data-sair-adm>${I.out}Sair</button></aside>`,
    top:`<div class="topbar mob-only"><div class="topbar-in"><div class="brand"><span class="brand-mark" style="width:34px;height:34px">${I.logo}</span><div style="font-size:14px">${marca}<small>Painel do proprietário</small></div></div><div style="display:flex;gap:6px">${botaoTema()}<button class="btn btn-ghost btn-sm" data-sair-adm>${I.out} Sair</button></div></div></div>`,
    bottom:`<nav class="bnav">${itens.filter(x => noMenuDeBaixo.includes(x[0])).map(([k,t,ic,b,cl]) => `<button class="${at===k?'on':''}" data-ir="#/admin/${k}">${ic}${t}${b?`<span class="dot ${cl||''}">${b}</span>`:''}</button>`).join('')}<button class="${itens.some(x => x[0] === at && !noMenuDeBaixo.includes(at)) ? 'on' : ''}" data-mais>${I.mais}Mais</button></nav>`,
  };
}
function dadosGerais(){
  const porU = S.unidades.map(u => { const its = itensDe(u); return { u, its, r: resumo(u, its) }; });
  return { porU, aguard: porU.reduce((a,x)=>a + x.r.aguard.length, 0), avisos: porU.filter(x => x.r.venc.length || x.r.vence.length).length };
}
async function telaAdmin(p, v){
  if (!SA?.token) return telaLoginAdmin();
  if (p[1] === 'unidade' && p[3]){ // área de uma unidade vista pelo proprietário
    if (!ADM) await carregarAdmin();
    await carregarDono(true);
    if (velha(v)) return;
    await paginaDono(p.slice(3));
    return;
  }
  await carregarAdmin();
  if (velha(v)) return;
  const pag = p[1] || 'inicio';
  if (indiv()){
    const u1 = S.unidades[0];
    if (pag === 'dados'){ location.hash = `#/admin/unidade/${slugDe(u1)}/dados`; return; }
    if (pag === 'reserva' && p[2]){ const r = ADM.reservas.find(x => x.id === p[2]); const u = r && S.unidades.find(x => x.id === r.uid); location.hash = u ? `#/admin/unidade/${slugDe(u)}/reserva/${r.id}` : '#/admin/temporada'; return; }
    if (pag === 'unidade' && p[2]){ location.hash = `#/admin/unidade/${p[2]}/temporada`; return; }
    if (!['inicio','temporada','unidades','anuncios','ajustes'].includes(pag)){ location.hash = '#/admin/inicio'; return; }
    const navI = navAdmin(pag);
    const corpoI = pag === 'inicio' ? paginaInicioInd() : pag === 'temporada' ? paginaTemporadaAdm() : pag === 'unidades' ? paginaUnidadesInd() : pag === 'anuncios' ? paginaAnuncios() : paginaAjustes();
    app.innerHTML = `<div class="shell">${navI.side}<main class="main">${navI.top}<div class="wrap-wide">${corpoI}</div></main></div>${navI.bottom}`;
    if (pag === 'ajustes') prepararAjustes();
    if (pag === 'anuncios') prepararAnuncios();
    if (pag === 'unidades') prepararUnidadesInd();
    if (ADM.deveTrocar) pedirNovaSenha(true);
    return;
  }
  const G = dadosGerais();
  const nav = navAdmin(pag === 'unidade' ? 'unidades' : pag);
  let corpo = '';
  if (pag === 'inicio') corpo = paginaInicio(G);
  else if (pag === 'conferir') corpo = paginaConferir(G);
  else if (pag === 'unidades') corpo = paginaUnidades(G);
  else if (pag === 'unidade') corpo = paginaUnidadeAdm(unidadeSlug(p[2]));
  else if (pag === 'avisos') corpo = paginaAvisos(G);
  else if (pag === 'temporada') corpo = paginaTemporadaAdm();
  else if (pag === 'valores') corpo = paginaValores();
  else if (pag === 'extras') corpo = paginaExtras();
  else if (pag === 'ajustes') corpo = paginaAjustes();
  else if (pag === 'anuncios') corpo = paginaAnuncios();
  app.innerHTML = `${hojeSim ? `<div class="alert warn" style="margin:0;border-radius:0;justify-content:center">Simulando a data ${fmtD(hojeSim)} nesta tela · <button class="back" data-sem-sim>usar data real</button></div>` : ''}<div class="shell">${nav.side}<main class="main">${nav.top}<div class="wrap-wide">${corpo}</div></main></div>${nav.bottom}`;
  if (pag === 'ajustes') prepararAjustes();
  if (pag === 'anuncios') prepararAnuncios();
  if (pag === 'extras') prepararExtras();
  if (pag === 'unidade') prepararUnidadeAdm(unidadeSlug(p[2]));
  if (ADM.deveTrocar) pedirNovaSenha(true);
}
const cab = (t, s, dir='') => `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap"><div><h1 class="h-title">${t}</h1>${s?`<p class="h-sub">${s}</p>`:''}</div>${dir}</div>`;
function paginaInicio(G){
  const hj = hoje(), ym = hj.slice(0,7);
  let recebMes = 0, aReceberMes = 0, vencTot = 0, vencN = 0;
  for (const { u, its } of G.porU) for (const it of its){
    const rec = S.pag[u.id]?.[it.k];
    if (rec?.st === 'pago' && (rec.conf||'').slice(0,7) === ym) recebMes += it.valor;
    if (it.venc.slice(0,7) === ym && it.st !== 'pago') aReceberMes += it.valor;
    if (it.st === 'vencido'){ vencTot += it.valor; vencN++; }
  }
  const meses = Array.from({length:12}, (_,i) => addMes(ym, i-2, 1).slice(0,7));
  const itsGraf = S.unidades.map(u => itensDe(u, { ateMes: meses[meses.length - 1] }));
  const col = meses.map(m => { let tot = 0, pg = 0; for (const its of itsGraf) for (const it of its) if (it.venc.slice(0,7) === m){ tot += it.valor; if (it.st === 'pago') pg += it.valor; } return { m, tot, pg }; });
  const max = Math.max(...col.map(c=>c.tot), 1), nomeMes = MESES_L[+ym.slice(5)-1];
  const pend = ADM.reservas.filter(r => r.status === 'pago_informado');
  return `${cab('Visão geral', `Hoje, ${fmtD(hj)} · ${S.unidades.length} unidades`, `<a class="btn btn-ghost btn-sm" href="#/admin/avisos">${I.bell} Enviar avisos</a>`)}
    <div class="kpis">
      <div class="kpi k1"><div class="t">Recebido em ${nomeMes}</div><div class="v mono">${brl(recebMes)}</div><div class="s">baixas conferidas no mês</div></div>
      <div class="kpi k2"><div class="t">A receber em ${nomeMes}</div><div class="v mono">${brl(aReceberMes)}</div><div class="s">parcelas que vencem no mês</div></div>
      <div class="kpi k3"><div class="t">Em atraso</div><div class="v mono">${brl(vencTot)}</div><div class="s">${vencN} parcela${vencN===1?'':'s'} vencida${vencN===1?'':'s'}</div></div>
      <div class="kpi k4"><div class="t">Para conferir</div><div class="v mono">${G.aguard}</div><div class="s"><a href="#/admin/conferir" style="color:var(--t-wait);font-weight:700">ver pagamentos informados</a></div></div>
    </div>
    ${pend.length ? `<a class="alert wait" href="#/admin/temporada"><div class="ic">🏖️</div><div><b>${pend.length} reserva${pend.length>1?'s':''} de temporada com Pix informado</b><br><span class="hint">O dono de cada unidade confere. Toque para ver.</span></div></a>` : ''}
    <div class="panel" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center"><b>Previsto x recebido</b><span class="hint">12 meses</span></div>
      <div class="chart">${col.map(c => `<div class="col ${c.m===ym?'cur':''}" title="${mesAno(c.m+'-01')}: ${brl(c.pg)} de ${brl(c.tot)}"><em>${c.tot ? (c.tot >= 1000 ? (c.tot/1000).toLocaleString('pt-BR',{maximumFractionDigits:c.tot>=100000?0:1}) + ' mil' : brl(c.tot)) : ''}</em><div class="stack" style="height:${Math.max(4, c.tot/max*84)}%"><i style="height:${c.tot ? c.pg/c.tot*100 : 0}%"></i></div><span>${MESES[+c.m.slice(5)-1]}${c.m.slice(5)==='01'||c.m===meses[0]?`<br>${c.m.slice(2,4)}`:''}</span></div>`).join('')}</div>
      <div class="legend"><span><i style="background:#22b375"></i>Recebido</span><span><i style="background:var(--line2)"></i>Previsto</span><span>Dezembro inclui as intermediárias</span></div>
    </div>
    <div class="section-t"><h3>Unidades</h3><span>🟢 em dia · 🟡 vence em breve · 🔵 conferir · 🔴 atraso</span></div>
    ${gridUnidades(G.porU)}`;
}
function gridUnidades(porU){
  return `<div class="ugrid">${porU.map(({u, r}) => { const p = r.totalImovel ? r.pagoImovel / r.totalImovel * 100 : 0; const ac = ADM.acessos[u.id]; return `<a class="ucard" href="#/admin/unidade/${slugDe(u)}">
    <div class="t"><b>${esc(u.nome)}</b><span style="width:10px;height:10px;border-radius:50%;flex:none;background:${corSit[r.situacao]}"></span></div>
    <div class="m">${esc(S.planos[u.tipo].nome)} · ${esc(u.piso)}</div>
    <div style="font-size:12px;font-weight:700;margin-top:6px;color:${corSit[r.situacao]}">${txtSit[r.situacao]}</div>
    <div class="bar"><i style="width:${p.toFixed(1)}%"></i></div>
    <div class="f"><span>${p.toFixed(1)}% quitado</span><span>${ac?.ativo ? '🔐 com senha' : '⏳ sem senha'}</span></div></a>`; }).join('')}</div>`;
}
let _grupos = [];
function paginaConferir(G){
  const lst = [];
  for (const { u, its } of G.porU) for (const it of its) if (it.st === 'aguardando') lst.push({ u, it, rec:S.pag[u.id][it.k] });
  lst.sort((a,b) => (a.rec.inf||'').localeCompare(b.rec.inf||''));
  _grupos = [];
  for (const x of lst){ const g = _grupos.find(g => g.u.id === x.u.id && g.inf === x.rec.inf); if (g) g.its.push(x.it); else _grupos.push({ u:x.u, inf:x.rec.inf, its:[x.it] }); }
  return `${cab('Conferir pagamentos', 'O dono da unidade informou que pagou. Confira no seu banco e dê a baixa.')}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px">${_grupos.length ? _grupos.map((g, gi) => `
      <div class="row-card"><div class="gi ${g.its[0].g}" style="width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-size:20px">${GRUPOS[g.its[0].g].ico}</div>
        <div class="mid"><b>${esc(g.u.nome)} · <span class="mono">${brl(g.its.reduce((a,b)=>a+b.valor,0))}</span></b><p>${g.its.map(i => `${esc(i.titulo)} (venc. ${fmtD(i.venc)})`).join('<br>')}${g.inf ? `<br>Informado em ${fmtDH(g.inf)}` : ''}</p></div>
        <div class="acts"><button class="btn btn-bad btn-sm" data-recusar="${gi}">Não recebi</button><button class="btn btn-ok btn-sm" data-conferir="${gi}">${I.check} Conferido · dar baixa</button></div></div>`).join('') : `<div class="panel empty"><b>✅</b>Nenhum pagamento esperando conferência.</div>`}</div>`;
}
function paginaUnidades(G){
  return `${cab('Unidades', 'Toque numa unidade para ver as parcelas, a temporada, os dados do dono e o acesso.')}
    <div class="section-t"><h3>Apartamentos</h3><span>1 a 6 piso de baixo · 11 a 16 piso de cima</span></div>${gridUnidades(G.porU.filter(x => x.u.tipo === 'apto'))}
    <div class="section-t"><h3>Kitnets</h3><span>1 a 3 frente · 4 a 7 piso de cima</span></div>${gridUnidades(G.porU.filter(x => x.u.tipo !== 'apto'))}`;
}
let estU = { aba:'prox' };
function paginaUnidadeAdm(u){
  if (!u) return '<div class="empty">Unidade não encontrada.</div>';
  const its = itensDe(u), r = resumo(u, its), f = estU.aba, ac = ADM.acessos[u.id], sl = slugDe(u);
  const abas = [['prox','Abertas'],['aguard','Conferir'],['M','Mensalidades'],['C','Condomínio'],...(r.n.X.total ? [['X','Extras']] : []),['I','Intermediárias'],['E','Entrada'],['pagos','Pagas']];
  let mostra;
  if (f === 'prox') mostra = its.filter(i => ['vencido','vence','aberto'].includes(i.st)).sort((a,b)=>a.venc.localeCompare(b.venc));
  else if (f === 'aguard') mostra = r.aguard; else if (f === 'pagos') mostra = its.filter(i => i.st === 'pago'); else mostra = its.filter(i => i.g === f);
  return `<a class="back" href="#/admin/unidades">${I.back} Unidades</a>
    <div style="margin-top:12px">${cab(esc(u.nome), `${esc(S.planos[u.tipo].nome)} · ${esc(u.piso)}`, `<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="#/admin/unidade/${sl}/temporada">${I.beach} Temporada</a><a class="btn btn-ghost btn-sm" href="#/admin/unidade/${sl}/dados">${I.user} Dados do dono</a></div>`)}</div>
    <div class="kpis">
      <div class="kpi k1"><div class="t">Imóvel pago</div><div class="v mono">${brl(r.pagoImovel)}</div><div class="s">de ${brl(r.totalImovel)}</div></div>
      <div class="kpi k2"><div class="t">Condomínio</div><div class="v mono">${r.n.C.pagas}/${r.n.C.total}</div><div class="s">${brl(r.pagoCondo)} pagos</div></div>
      <div class="kpi k3"><div class="t">Em atraso</div><div class="v mono">${brl(r.venc.reduce((a,b)=>a+b.valor,0))}</div><div class="s">${r.venc.length} parcela(s)</div></div>
      <div class="kpi k4"><div class="t">Para conferir</div><div class="v mono">${r.aguard.length}</div><div class="s">informadas pelo dono</div></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <form id="fund" class="grid3">
        <div class="field"><label>Nome (dono)</label><input class="inp" name="nome" value="${esc(u.nome)}"></div>
        <div class="field"><label>WhatsApp do dono</label><input class="inp" name="whats" inputmode="tel" placeholder="(13) 99999-9999" value="${esc(u.whats)}"></div>
        <div class="field"><label>Tipo</label><select class="inp" name="tipo">${Object.entries(S.planos).map(([k,p]) => `<option value="${k}" ${u.tipo===k?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></div>
        <div class="field span2"><label>Localização</label><input class="inp" name="piso" value="${esc(u.piso)}"></div>
        <div class="field" style="justify-content:flex-end"><button class="btn btn-sea">Salvar dados</button></div>
      </form>
      <div class="divider"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-aviso="pre" data-u="${u.id}" ${r.vence.length?'':'disabled'}>${I.bell} Aviso 3 dias antes (${r.vence.length})</button>
        <button class="btn btn-bad btn-sm" data-aviso="pos" data-u="${u.id}" ${r.venc.length?'':'disabled'}>⚠️ Cobrar vencidas (${r.venc.length})</button>
      </div>
    </div>
    <div class="plan"><h4>${I.lock} Acesso do dono ${ac.ativo ? '<span class="chip st-pago"><i></i>senha criada</span>' : '<span class="chip st-pre"><i></i>ainda sem senha</span>'}</h4>
      <p class="hint">${ac.ativo ? 'O dono já criou a própria senha. Se ele esquecer, pode pedir um código pelo WhatsApp na tela de entrada, ou você gera um código novo aqui.' : 'Gere um código e envie ao dono. Com ele, o dono cria a própria senha no primeiro acesso.'}</p>
      ${ac.convite ? `<p style="margin-top:10px">Código ativo: <b class="mono" style="font-size:20px;letter-spacing:.1em">${esc(ac.convite)}</b> <span class="hint">(vale 7 dias)</span></p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-sun btn-sm" data-convite="${ac.ativo ? 'reset' : 'novo'}">${ac.ativo ? 'Redefinir senha (gerar código)' : 'Gerar código de primeiro acesso'}</button>
        ${ac.convite ? `<button class="btn btn-wa btn-sm" data-enviarconvite="${esc(ac.convite)}">${I.wa} Enviar código ao dono</button>` : ''}
      </div></div>
    <div class="section-t"><h3>Parcelas</h3><span>toque para dar baixa ou ajustar</span></div>
    <div class="tabs">${abas.map(([k,t]) => `<button class="tab ${f===k?'on':''}" data-uaba="${k}">${t}${k==='aguard'&&r.aguard.length?`<span class="cnt" style="background:var(--wait)">${r.aguard.length}</span>`:''}</button>`).join('')}</div>
    <div class="list">${mostra.length ? mostra.map(it => liItem(u, it, { dono:true })).join('') : '<div class="empty">Nada aqui.</div>'}</div>`;
}
function prepararUnidadeAdm(u){
  if (!u) return;
  const f = $('#fund');
  f.whats.oninput = e => { e.target.value = mascaraFone(e.target.value); };
  f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f);
    ocupado(e.submitter, async () => { const r = await apiAdmin('config', { config:{ unidades:[{ id:u.id, nome:fd.get('nome'), whats:fd.get('whats'), tipo:fd.get('tipo'), piso:fd.get('piso') }] } }); ADM.config = r.config; toast('✅ Dados da unidade salvos'); render(); }); };
  $$('[data-convite]').forEach(b => b.onclick = () => {
    const reset = b.dataset.convite === 'reset';
    if (reset && !confirm('A senha atual do dono deixa de valer e ele cria outra com o código novo. Continuar?')) return;
    ocupado(b, async () => { const r = await apiAdmin('convite', { u:u.id, resetar:reset }); toast('Código gerado: ' + r.codigo); await render(); });
  });
  $$('[data-enviarconvite]').forEach(b => b.onclick = () => enviarWhats(u.whats, `Olá, ${u.nome}! 👋\n\nEste é o app do ${S.cond.nome}. Por ele você acompanha as parcelas, paga com Pix e cuida do aluguel por temporada da sua unidade.\n\n1️⃣ Abra: ${location.origin}/app#/primeiro/${slugDe(u)}\n2️⃣ Digite o código: *${b.dataset.enviarconvite}*\n3️⃣ Crie a sua senha (só você vai saber).\n\nO código vale por 7 dias.${assinatura()}`));
}
function acaoItemDono(u, k){
  const it = itensDe(u).find(i => i.k === k); if (!it) return;
  const rec = S.pag[u.id]?.[k];
  modal(`<h3>${esc(it.titulo)}</h3><p class="hint">${esc(u.nome)} · ${esc(it.sub||'')}</p>
    <div style="margin:14px 0"><span class="chip st-${it.st}"><i></i>${rotulo(it)}</span></div>
    ${rec?.inf ? `<p class="hint">Informado pelo dono em ${fmtDH(rec.inf)}</p>` : ''}${rec?.conf ? `<p class="hint">Baixa dada em ${fmtDH(rec.conf)}</p>` : ''}
    <form id="faj" class="grid2" style="margin-top:12px"><div class="field"><label>Valor</label><input class="inp" name="valor" inputmode="decimal" value="${it.valor}"></div><div class="field"><label>Vencimento</label><input class="inp" type="date" name="venc" value="${it.venc}"></div></form>
    <p class="hint" style="margin-top:6px">Mudar aqui vale só para esta parcela desta unidade.</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      ${it.st === 'pago' ? `<button class="btn btn-bad" data-x="desfazer">Desfazer baixa</button>` : `<button class="btn btn-ok" data-x="baixa">${I.check} Dar baixa (recebido)</button>`}
      ${it.st === 'aguardando' ? `<button class="btn btn-bad" data-x="recusar">Não recebi</button>` : ''}
      <button class="btn btn-sea" data-x="ajustar">${I.edit} Salvar valor e data</button>
      ${S.ajuste[u.id]?.[k] ? `<button class="btn btn-ghost" data-x="restaurar">Voltar ao valor padrão</button>` : ''}
      <button class="btn btn-ghost" data-fechar>Fechar</button></div>`, ov => {
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const x = b.dataset.x;
      if (x === 'baixa') { fecharModal(); return darBaixa(u, [k]); }
      const fd = new FormData($('#faj', ov));
      const corpo = x === 'ajustar' ? { u:u.id, key:k, valor:num(fd.get('valor')), venc:fd.get('venc') } : { u:u.id, key:k, keys:[k] };
      if (x === 'ajustar' && !(corpo.valor >= 0)) return toast('Valor inválido');
      ocupado(b, async () => { const r = await apiAdmin(x, corpo); aplicarUnidade(u.id, r.parcelas); fecharModal(); toast({ desfazer:'Baixa desfeita', recusar:'Voltou para em aberto', ajustar:'Parcela ajustada', restaurar:'Valor padrão restaurado' }[x]); render(); });
    });
  });
}
async function darBaixa(u, keys){
  const its = itensDe(u).filter(i => keys.includes(i.k));
  try {
    const r = await apiAdmin('baixa', { u:u.id, keys }); aplicarUnidade(u.id, r.parcelas); await render();
    toast(`✅ Baixa dada · ${u.nome}`, { txt:'Avisar o dono', fn: () => enviarWhats(u.whats, msgConfirmado(u, its)) });
  } catch(e){ toast(e.message); }
}
function paginaAvisos(G){
  const pre = G.porU.filter(x => x.r.vence.length), pos = G.porU.filter(x => x.r.venc.length);
  const ult = (u, tipo) => { const a = S.avisos[u.id]?.[tipo]; return a ? `avisado em ${new Date(a).toLocaleDateString('pt-BR')}` : 'ainda não avisado'; };
  const card = (x, tipo) => { const its = tipo === 'pre' ? x.r.vence : x.r.venc; return `<div class="row-card"><div class="mid"><b>${esc(x.u.nome)} · <span class="mono">${brl(its.reduce((a,b)=>a+b.valor,0))}</span></b><p>${its.map(i => `${esc(i.titulo)} - ${rotulo(i).toLowerCase()} (${fmtD(i.venc)})`).join('<br>')}<br><span style="color:${S.avisos[x.u.id]?.[tipo] ? 'var(--t-ok)' : 'var(--dim)'}">${ult(x.u, tipo)}</span>${x.u.whats ? '' : ' · <span style="color:var(--t-warn)">sem WhatsApp cadastrado</span>'}</p></div>
    <div class="acts"><button class="btn ${tipo==='pre'?'btn-ghost':'btn-bad'} btn-sm" data-aviso="${tipo}" data-u="${x.u.id}">${I.wa} ${tipo==='pre'?'Avisar':'Cobrar'}</button></div></div>`; };
  return `${cab('Avisos de vencimento', `Mensagens prontas para o WhatsApp de cada dono. ${ADM.integracoes.papi ? 'O WhatsApp automático (PAPI) está ligado: o envio é direto.' : 'Sem PAPI: o WhatsApp abre com a mensagem pronta.'}`)}
    <div class="section-t"><h3>🔔 Vencem nos próximos 3 dias</h3>${pre.length ? `<button class="btn btn-sea btn-sm" data-lote="pre">${I.wa} Avisar todos (${pre.length})</button>` : ''}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${pre.length ? pre.map(x => card(x,'pre')).join('') : '<div class="panel empty">Nenhuma parcela vence nos próximos 3 dias.</div>'}</div>
    <div class="section-t"><h3>⚠️ Vencidas</h3>${pos.length ? `<button class="btn btn-bad btn-sm" data-lote="pos">${I.wa} Cobrar todos (${pos.length})</button>` : ''}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${pos.length ? pos.map(x => card(x,'pos')).join('') : '<div class="panel empty">Nenhuma parcela vencida. 🎉</div>'}</div>`;
}
async function enviarAviso(u, tipo){
  const r = resumo(u), its = tipo === 'pre' ? r.vence : r.venc;
  if (!its.length) return toast('Nada para avisar nesta unidade');
  if (!u.whats) toast('Sem WhatsApp cadastrado: escolha o contato no WhatsApp');
  await enviarWhats(u.whats, tipo === 'pre' ? msgPre(u, its) : msgPos(u, its));
  try { const x = await apiAdmin('aviso', { u:u.id, tipo }); aplicarUnidade(u.id, x.parcelas); } catch(e){}
  if (rota()[1] === 'avisos') render();
}
function avisoLote(tipo){
  const fila = dadosGerais().porU.filter(x => (tipo === 'pre' ? x.r.vence : x.r.venc).length).map(x => x.u);
  if (!fila.length) return;
  if (ADM.integracoes.papi && !hojeSim){
    return ocupado(null, async () => { const r = await apiAdmin('avisoLote', { tipo }); toast(`✅ ${r.ok} de ${r.total} avisos enviados pelo WhatsApp automático`); render(); });
  }
  let i = 0;
  const passo = () => { const u = fila[i];
    modal(`<h3>Aviso ${i+1} de ${fila.length}</h3><p class="hint">${tipo==='pre'?'Lembrete de vencimento':'Cobrança de parcela vencida'} · o WhatsApp abre com a mensagem pronta.</p>
      <div class="row-card" style="margin-top:14px"><div class="mid"><b>${esc(u.nome)}</b><p>${u.whats ? esc(u.whats) : 'Sem número: você escolhe o contato'}</p></div></div>
      <button class="btn btn-wa btn-block" style="margin-top:14px" data-go>${I.wa} Abrir WhatsApp</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-pular>${i+1 < fila.length ? 'Pular este' : 'Fechar'}</button>`, ov => {
      $('[data-go]', ov).onclick = async () => { abrirWhats(u.whats, tipo === 'pre' ? msgPre(u, resumo(u).vence) : msgPos(u, resumo(u).venc)); try { const x = await apiAdmin('aviso', { u:u.id, tipo }); aplicarUnidade(u.id, x.parcelas); } catch(e){} i++; i < fila.length ? passo() : (fecharModal(), toast('Pronto! Todos os avisos abertos.'), render()); };
      $('[data-pular]', ov).onclick = () => { i++; i < fila.length ? passo() : (fecharModal(), render()); };
    });
  };
  passo();
}
function paginaTemporadaAdm(){
  const nomeU = (id) => S.unidades.find(u => u.id === id);
  const ativas = ADM.reservas.filter(r => BLOQUEIA.includes(r.status));
  return `${cab(indiv() ? 'Reservas' : 'Temporada', indiv() ? 'Todas as reservas das suas unidades. Toque numa reserva para conferir o Pix, o contrato e os documentos.' : 'Reservas de todas as unidades. Cada dono confere o próprio Pix, mas você também pode abrir e agir.', `<a class="btn btn-ghost btn-sm" href="/" target="_blank">${I.home} Ver o site</a>`)}
    <div class="kpis">
      <div class="kpi k4"><div class="t">Pix informado</div><div class="v">${ADM.reservas.filter(r => r.status === 'pago_informado').length}</div><div class="s">${indiv() ? 'para você conferir' : 'aguardando o dono'}</div></div>
      <div class="kpi k2"><div class="t">Reservas ativas</div><div class="v">${ativas.length}</div><div class="s">pré, confirmadas e assinadas</div></div>
      <div class="kpi k1"><div class="t">Contratos assinados</div><div class="v">${ADM.reservas.filter(r => r.status === 'assinado').length}</div><div class="s">no total</div></div>
      <div class="kpi k3"><div class="t">Valor das ativas</div><div class="v mono">${brl(ativas.reduce((a,b)=>a+(b.total||0),0))}</div><div class="s">diárias + limpeza + caução</div></div>
    </div>
    <div class="section-t"><h3>Reservas</h3></div>
    <div class="list">${ADM.reservas.length ? ADM.reservas.map(r => { const u = nomeU(r.uid); return `<a class="item" href="#/admin/unidade/${slugDe(u)}/reserva/${r.id}"><div class="gi R">🏖️</div><div class="mid"><b>${esc(u.nome)} · ${esc(r.titular)}</b><span>${fmtD(r.ci)} a ${fmtD(r.co)} · ${r.hospedes} hósp. · docs ${r.docsOk}/${r.docsTotal}</span></div><div class="rt"><b class="mono">${brl(r.total)}</b><span class="chip st-${r.status}"><i></i>${STATUS_RES[r.status]}</span></div></a>`; }).join('') : '<div class="empty"><b>🏖️</b>Nenhuma reserva ainda.</div>'}</div>
    <div class="section-t"><h3>Anúncios das unidades</h3><span>edite como proprietário</span></div>
    <div class="ugrid">${S.unidades.map(u => `<a class="ucard" href="#/admin/unidade/${slugDe(u)}/temporada" data-tab-t="anuncio"><b>${esc(u.nome)}${u.apelido ? ' · ' + esc(u.apelido) : ''}</b><div class="m">${esc(S.planos[u.tipo]?.nome || TIPOS_U[u.tipo] || '')}</div><div class="f"><span>${I.edit} editar anúncio</span></div></a>`).join('')}</div>`;
}
/* ---------------- site individual: início, unidades ---------------- */
function paginaInicioInd(){
  const hj = hojeLocal();
  const ativas = ADM.reservas.filter(r => BLOQUEIA.includes(r.status));
  const pend = ADM.reservas.filter(r => r.status === 'pago_informado');
  const prox = ativas.filter(r => r.co >= hj).sort((a, b) => a.ci.localeCompare(b.ci)).slice(0, 6);
  const nomeU = (id) => S.unidades.find(u => u.id === id) || { nome:'?', id };
  const linkRes = (r) => `#/admin/unidade/${slugDe(nomeU(r.uid))}/reserva/${r.id}`;
  return `${cab('Visão geral', `Hoje, ${fmtD(hj)} · ${S.unidades.length} unidade${S.unidades.length>1?'s':''} no site`, `<a class="btn btn-ghost btn-sm" href="/" target="_blank">${I.home} Ver o site</a>`)}
    <div class="kpis">
      <div class="kpi k4"><div class="t">Pix para conferir</div><div class="v">${pend.length}</div><div class="s">hóspedes que informaram o sinal</div></div>
      <div class="kpi k2"><div class="t">Reservas ativas</div><div class="v">${ativas.length}</div><div class="s">pré, confirmadas e assinadas</div></div>
      <div class="kpi k1"><div class="t">Próxima entrada</div><div class="v" style="font-size:22px">${prox[0] ? fmtD(prox[0].ci) : '-'}</div><div class="s">${prox[0] ? esc(prox[0].titular) : 'nenhuma marcada'}</div></div>
      <div class="kpi k3"><div class="t">Valor das ativas</div><div class="v mono">${brl(ativas.reduce((a, b) => a + (b.total || 0), 0))}</div><div class="s">total das estadias</div></div>
    </div>
    ${pend.map(r => `<a class="alert wait" href="${linkRes(r)}"><div class="ic">💰</div><div><b>${esc(r.titular)} informou o Pix</b><br><span class="hint">${esc(nomeU(r.uid).nome)} · ${fmtD(r.ci)} a ${fmtD(r.co)}. Toque para conferir e confirmar.</span></div></a>`).join('')}
    <div class="section-t"><h3>Próximas estadias</h3><a class="hint" href="#/admin/temporada">ver todas</a></div>
    <div class="list">${prox.length ? prox.map(r => `<a class="item" href="${linkRes(r)}"><div class="gi R">🏖️</div><div class="mid"><b>${esc(r.titular)}</b><span>${esc(nomeU(r.uid).nome)} · ${fmtD(r.ci)} a ${fmtD(r.co)} · ${r.hospedes} hósp.</span></div><div class="rt"><b class="mono">${brl(r.total)}</b><span class="chip st-${r.status}"><i></i>${STATUS_RES[r.status]}</span></div></a>`).join('') : '<div class="empty"><b>🏖️</b>Nenhuma estadia marcada ainda.</div>'}</div>
    <div class="section-t"><h3>Suas unidades</h3><a class="hint" href="#/admin/unidades">gerenciar</a></div>
    <div class="ugrid">${S.unidades.map(u => `<div class="ucard"><b>${esc(u.nome)}${u.apelido ? ' · ' + esc(u.apelido) : ''}</b><div class="m">${esc(TIPOS_U[u.tipo] || '')} · ${esc(u.piso || '')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><a class="btn btn-ghost btn-sm" href="#/admin/unidade/${slugDe(u)}/temporada" data-tab-t="anuncio">${I.edit} Anúncio e valores</a><a class="btn btn-ghost btn-sm" href="#/admin/unidade/${slugDe(u)}/temporada" data-tab-t="calendario">${I.cal} Calendário</a></div></div>`).join('')}</div>`;
}
function paginaUnidadesInd(){
  return `${cab('Unidades', 'As unidades que aparecem no seu site. Para colocar outro apartamento ou kitnet, toque em Nova unidade.', `<button class="btn btn-sun btn-sm" data-novau>＋ Nova unidade</button>`)}
    <div class="list" style="margin-top:18px">${S.unidades.map(u => `<div class="row-card"><div class="gi R" style="width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-size:20px">${u.tipo === 'apto' ? '🏠' : '🛏️'}</div>
      <div class="mid"><b>${esc(u.nome)}${u.apelido ? ` · <span style="color:var(--t-warn)">${esc(u.apelido)}</span>` : ''}</b><p>${esc(TIPOS_U[u.tipo] || '')} · ${esc(u.piso || '')} · site: /#/unidade/${esc(slugDe(u))}</p></div>
      <div class="acts"><a class="btn btn-ghost btn-sm" href="#/admin/unidade/${slugDe(u)}/temporada" data-tab-t="anuncio">${I.edit} Anúncio</a><button class="btn btn-ghost btn-sm" data-editu="${esc(u.id)}">Editar</button>${S.unidades.length > 1 ? `<button class="btn btn-bad btn-sm" data-remu="${esc(u.id)}">Remover</button>` : ''}</div></div>`).join('')}</div>
    <p class="hint" style="margin-top:14px">Cada unidade nova já começa com os valores padrão (diária, pacotes de Natal e Réveillon e sinal de 50%). Depois é só ajustar no anúncio dela.</p>`;
}
function formUnidade(u = {}){
  modal(`<h3>${u.id ? 'Editar unidade' : 'Nova unidade'}</h3>
    <form id="fun" style="display:flex;flex-direction:column;gap:12px;margin-top:14px">
      <div class="grid2 m1">
        <div class="field"><label>Tipo</label><select class="inp" name="tipo">${Object.entries(TIPOS_U).map(([k, t]) => `<option value="${k}" ${(u.tipo || 'apto') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Número</label><input class="inp" name="num" inputmode="numeric" value="${esc(u.num ?? '')}" placeholder="Ex.: 4"></div>
        <div class="field"><label>Nome no site</label><input class="inp" name="nome" value="${esc(u.nome || '')}" placeholder="Ex.: Apto 4"></div>
        <div class="field"><label>Codinome (opcional)</label><input class="inp" name="apelido" value="${esc(u.apelido || '')}" placeholder="Ex.: Maya"></div>
        <div class="field span2"><label>Andar ou posição</label><input class="inp" name="piso" value="${esc(u.piso || '')}" placeholder="Ex.: Piso de baixo"></div>
      </div>
      <button class="btn btn-sun">${I.check} Salvar unidade</button><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
    </form>`, ov => {
    const f = $('#fun', ov);
    f.onsubmit = e => { e.preventDefault();
      const unidade = { id:u.id || '', tipo:f.tipo.value, num:num(f.num.value), nome:f.nome.value.trim(), apelido:f.apelido.value.trim(), piso:f.piso.value.trim() };
      if (!(unidade.num > 0)) return toast('Informe o número da unidade.');
      ocupado(e.submitter, async () => { await apiAdmin('unidadeSalvar', { unidade }); fecharModal(); toast('✅ Unidade salva'); render(); });
    };
  });
}
function prepararUnidadesInd(){
  $('[data-novau]') && ($('[data-novau]').onclick = () => formUnidade());
  $$('[data-editu]').forEach(b => b.onclick = () => formUnidade(S.unidades.find(u => u.id === b.dataset.editu)));
  $$('[data-remu]').forEach(b => b.onclick = () => { const u = S.unidades.find(x => x.id === b.dataset.remu); if (u && confirm(`Remover ${u.nome} do site? O anúncio e as fotos dela deixam de aparecer.`)) ocupado(b, async () => { await apiAdmin('unidadeRemover', { id:u.id }); toast('Unidade removida'); render(); }); });
}

/* ---------------- anúncios do popup e textos da capa ---------------- */
const ACOES_ANUNCIO = { 'datas':'Abrir as datas para reservar', 'tipo:apto':'Mostrar os apartamentos', 'tipo:kit':'Mostrar as kitnets', 'pacote:Natal':'Escolher o pacote de Natal', 'pacote:Réveillon':'Escolher o pacote de Réveillon', 'pacote:Carnaval':'Escolher o pacote de Carnaval' };
function paginaAnuncios(){
  const c = ADM.config, pp = c.popup || { ativo:true, segundos:3.5 }, st = c.site || {};
  const ops = (atual) => { const o = { ...ACOES_ANUNCIO }; if (indiv()) { delete o['tipo:kit']; } if (atual && !o[atual]) o[atual] = atual.replace('pacote:', 'Pacote '); return Object.entries(o).map(([k, t]) => `<option value="${esc(k)}" ${k === atual ? 'selected' : ''}>${esc(t)}</option>`).join(''); };
  return `${cab('Anúncios do site', 'O popup de ofertas aparece uma vez por visita, some sozinho em poucos segundos e não atrapalha a reserva. Depois que o hóspede escolhe as datas, ele passa a mostrar só as unidades livres.')}
    <form id="fanu">
      <div class="plan"><h4>🎁 Popup de ofertas</h4>
        <div class="grid3 m1">
          <label class="check" style="align-self:end"><input type="checkbox" name="ativo" ${pp.ativo !== false ? 'checked' : ''}> <span><b>Mostrar o popup</b></span></label>
          <div class="field"><label>Tempo na tela (segundos)</label><input class="inp" name="segundos" inputmode="decimal" value="${pp.segundos ?? 3.5}"></div>
        </div>
        <p class="hint" style="margin-top:8px">A cada visita o site começa por um anúncio diferente. O hóspede pode passar para os outros pelas setas ou pelo botão Ofertas.</p>
        <div id="anus" style="display:flex;flex-direction:column;gap:10px;margin-top:12px">${(c.anuncios || []).map((x, i) => `<div class="anu-row" data-anu="${esc(x.url)}">
          <img src="${esc(x.url)}" alt="Anúncio ${i + 1}">
          <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0">
            <div class="field"><label>Ao tocar no anúncio</label><select class="inp" data-acao>${ops(x.acao)}</select></div>
            <label class="check"><input type="checkbox" data-ativo ${x.ativo !== false ? 'checked' : ''}> <span>Ativo</span></label>
            <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-ghost btn-sm" data-sobe aria-label="Subir">↑</button><button type="button" class="btn btn-ghost btn-sm" data-desce aria-label="Descer">↓</button><button type="button" class="btn btn-bad btn-sm" data-delanu>Remover</button></div>
          </div></div>`).join('') || '<div class="empty">Nenhum anúncio. Adicione uma imagem.</div>'}</div>
        <label class="btn btn-ghost btn-sm" style="margin-top:12px">＋ Adicionar anúncio (imagem)<input type="file" accept="image/*" id="upAnu" hidden></label>
      </div>
      <div class="plan"><h4>✍️ Textos da capa do site</h4>
        <div class="grid2 m1">
          <div class="field"><label>Nome do site (topo e aba do navegador)</label><input class="inp" name="marca" maxlength="60" value="${esc(st.marca || '')}"></div>
          <div class="field"><label>Título</label><input class="inp" name="titulo" maxlength="80" value="${esc(st.titulo || '')}"></div>
          <div class="field"><label>Destaque do título (em cor)</label><input class="inp" name="destaque" maxlength="60" value="${esc(st.destaque || '')}"></div>
          <div class="field span2"><label>Texto abaixo do título</label><textarea class="inp" name="sub" rows="3" maxlength="400">${esc(st.sub || '')}</textarea></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="btn btn-sun" style="flex:1">${I.check} Salvar anúncios e textos</button><a class="btn btn-ghost" href="/" target="_blank">Ver o site</a></div>
    </form>`;
}
function prepararAnuncios(){
  const f = $('#fanu');
  f.addEventListener('click', e => {
    const row = e.target.closest('[data-anu]'); if (!row) return;
    if (e.target.closest('[data-sobe]') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    if (e.target.closest('[data-desce]') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
    if (e.target.closest('[data-delanu]') && confirm('Remover este anúncio?')) ocupado(null, async () => { const r = await apiAdmin('removerAnuncio', { url: row.dataset.anu }); ADM.config = r.config; toast('Anúncio removido'); render(); });
  });
  f.onsubmit = e => { e.preventDefault();
    const seg = num(f.segundos.value);
    if (!(seg >= 2 && seg <= 10)) return toast('O tempo do popup vai de 2 a 10 segundos.');
    const config = {
      popup:{ ativo:f.ativo.checked, segundos:seg },
      anuncios: $$('[data-anu]', f).map(r => ({ url:r.dataset.anu, acao:$('[data-acao]', r).value, ativo:$('[data-ativo]', r).checked })),
      site:{ marca:f.marca.value.trim(), titulo:f.titulo.value.trim(), destaque:f.destaque.value.trim(), sub:f.sub.value.trim() },
    };
    ocupado(e.submitter, async () => { const r = await apiAdmin('config', { config }); ADM.config = r.config; toast('✅ Anúncios e textos salvos'); render(); });
  };
  $('#upAnu').onchange = async (e) => { const file = e.target.files[0]; if (!file) return;
    try { toast('Enviando...'); const a = await prepararArquivo(file, { maxLado:1400, qualidade:.85 }); const r = await apiAdmin('anuncioFoto', { dados:a.dados, tipo:a.tipo }); ADM.config = r.config; toast('✅ Anúncio adicionado'); render(); }
    catch(err){ toast(err.message); } };
}
function linhaReajuste(r = {}){
  return `<div class="esp-row" data-rj style="grid-template-columns:1fr 1fr auto"><div class="field"><label>A partir de</label><input class="inp" type="month" data-rj-desde value="${esc(r.desde || '')}"></div><div class="field"><label>Novo valor (R$/mês)</label><input class="inp" data-rj-valor inputmode="decimal" value="${r.valor ?? ''}"></div><button type="button" class="btn btn-bad btn-sm" data-del-reaj>Remover</button></div>`;
}
function paginaValores(){
  const P = S.planos, D = S.datas;
  const plano = (k, p, ico, qtd) => { const soma = somaPlano(p), dif = Number(p.contrato) - soma; return `
    <div class="plan" data-plano="${k}"><h4><span style="font-size:22px">${ico}</span>${esc(p.nome)} <span class="pill">${qtd} unidade${qtd>1?'s':''}</span></h4>
      <div class="grid3">
        <div class="field"><label>Nome do tipo</label><input class="inp" data-f="nome" value="${esc(p.nome)}"></div>
        <div class="field"><label>Valor do imóvel (R$)</label><input class="inp" data-f="contrato" inputmode="decimal" value="${p.contrato}"></div>
        <div class="field"><label>Entrada (R$)</label><input class="inp" data-f="entrada" inputmode="decimal" value="${p.entrada}"></div>
        <div class="field"><label>Mensalidade (R$)</label><input class="inp" data-f="mensal" inputmode="decimal" value="${p.mensal}"></div>
        <div class="field"><label>Nº de mensalidades</label><input class="inp" data-f="mensalQtd" inputmode="numeric" value="${p.mensalQtd}"></div>
        <div class="field"><label>Intermediária anual (R$)</label><input class="inp" data-f="inter" inputmode="decimal" value="${p.inter}"></div>
        <div class="field span2"><label>Anos das intermediárias</label><input class="inp" data-f="interAnos" value="${(p.interAnos||[]).join(', ')}"></div>
        <div class="field"><label>Condomínio + água + IPTU (R$/mês)</label><input class="inp" data-f="condo" inputmode="decimal" value="${p.condo}"></div>
        <div class="field span2"><label>Reajustes do condomínio (novo valor a partir de um mês)</label><div data-reaj>${(p.condoReajustes||[]).map(linhaReajuste).join('')}</div><button type="button" class="btn btn-ghost btn-sm" style="align-self:flex-start;margin-top:6px" data-add-reaj>+ Reajuste</button></div>
      </div>
      <div class="chk-sum ${Math.abs(dif) < 0.01 ? 'ok' : 'diff'}">Entrada ${brl(p.entrada)} + ${(p.interAnos||[]).length} intermediárias de ${brl(p.inter)} + ${p.mensalQtd} mensalidades de ${brl(p.mensal)} = <b>${brl(soma)}</b><br>
        ${Math.abs(dif) < 0.01 ? '✅ Bate com o valor do imóvel.' : `⚠️ O valor do imóvel informado é ${brl(p.contrato)}: diferença de <b>${brl(dif)}</b>. O app cobra pela soma das parcelas.`}<br>Condomínio, água e IPTU: ${brl(valorCondo(p, hoje().slice(0,7)))}/mês, cobrado todo mês e sem prazo final${(p.condoReajustes||[]).length ? ' · reajustes: ' + p.condoReajustes.map(x => `${brl(x.valor)} a partir de ${mesAno(x.desde + '-01')}`).join(', ') : ''}.</div></div>`; };
  const qtd = (k) => S.unidades.filter(u => u.tipo === k).length;
  return `${cab('Valores e datas', 'Vale para todas as unidades do tipo (menos as parcelas ajustadas uma a uma).', `<button class="btn btn-sun" data-salvar-valores>${I.check} Salvar valores</button>`)}
    ${plano('apto', P.apto, '🏢', qtd('apto'))}${plano('kc', P.kc, '🏠', qtd('kc'))}${plano('kf', P.kf, '🏖️', qtd('kf'))}
    <div class="plan"><h4><span style="font-size:22px">📅</span>Datas de vencimento</h4>
      <div class="grid3">
        <div class="field"><label>Vencimento da entrada</label><input class="inp" type="date" data-d="entrada" value="${D.entrada}"></div>
        <div class="field"><label>1ª mensalidade (mês)</label><input class="inp" type="month" data-d="mensal1" value="${D.mensal1}"></div>
        <div class="field"><label>1º condomínio (mês)</label><input class="inp" type="month" data-d="condo1" value="${D.condo1}"></div>
        <div class="field"><label>Dia do vencimento mensal</label><input class="inp" inputmode="numeric" data-d="dia" value="${D.dia}"></div>
        <div class="field"><label>Mês das intermediárias</label><select class="inp" data-d="interMes">${MESES_L.map((m,i)=>`<option value="${i+1}" ${+D.interMes===i+1?'selected':''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Dia das intermediárias</label><input class="inp" inputmode="numeric" data-d="interDia" value="${D.interDia}"></div>
      </div>
      <p class="hint" style="margin-top:10px">Com a 1ª mensalidade em ${mesAno(D.mensal1+'-01')}, a última (${S.planos.apto.mensalQtd}ª) vence em ${fmtD(addMes(D.mensal1, S.planos.apto.mensalQtd-1, D.dia))}.</p></div>
    <button class="btn btn-sun btn-block" style="margin-top:16px" data-salvar-valores>${I.check} Salvar valores</button>`;
}
async function salvarValores(btn){
  const planos = {};
  for (const el of $$('[data-plano]')){
    const p = { ...S.planos[el.dataset.plano] };
    for (const inp of $$('[data-f]', el)){ const f = inp.dataset.f;
      if (f === 'nome') p.nome = inp.value.trim() || p.nome;
      else if (f === 'interAnos') p.interAnos = inp.value.split(/[^0-9]+/).map(Number).filter(n => n >= 2000 && n <= 2100);
      else { const n = num(inp.value); if (Number.isFinite(n) && n >= 0) p[f] = f.endsWith('Qtd') ? Math.round(n) : n; } }
    delete p.condoQtd;
    p.condoReajustes = $$('[data-rj]', el).map(row => ({ desde: $('[data-rj-desde]', row).value, valor: num($('[data-rj-valor]', row).value) })).filter(x => /^\d{4}-\d{2}$/.test(x.desde) && x.valor >= 0);
    planos[el.dataset.plano] = p;
  }
  const datas = { ...S.datas };
  for (const inp of $$('[data-d]')){ const f = inp.dataset.d; if (['dia','interMes','interDia'].includes(f)) datas[f] = Math.round(num(inp.value)); else if (inp.value) datas[f] = inp.value; }
  await ocupado(btn, async () => { const r = await apiAdmin('config', { config:{ planos, datas } }); ADM.config = r.config; toast('✅ Valores salvos'); render(); });
}
/* ---------------- melhorias e extras (ex.: pintura) ---------------- */
const cadastrada = (u) => !!ADM.acessos[u.id]?.ativo;
function paginaExtras(){
  const ex = S.extras || [];
  const temCad = S.unidades.some(cadastrada);
  const vencPadrao = addMes(hoje().slice(0,7), 1, Number(S.datas.dia));
  const lista = ex.map(x => {
    const ids = Object.keys(x.unidades);
    let quitadas = 0, recebido = 0;
    const linhas = ids.map(id => {
      const u = unidade(id); if (!u) return '';
      const its = itensDe(u).filter(i => i.k.startsWith('X' + x.id + '-'));
      const pagas = its.filter(i => i.st === 'pago');
      recebido += pagas.reduce((a,b) => a + b.valor, 0);
      if (pagas.length === its.length) quitadas++;
      const st = pagas.length === its.length ? 'pago' : its.some(i => i.st === 'vencido') ? 'vencido' : its.some(i => i.st === 'aguardando') ? 'aguardando' : 'aberto';
      return `<div class="sum-row"><span>${esc(u.nome)}${cadastrada(u) ? ' 🔐' : ''}</span><span style="display:flex;gap:8px;align-items:center"><span class="mono">${brl(x.unidades[id])}</span><span class="chip st-${st}"><i></i>${{ pago:'Quitado', vencido:'Em atraso', aguardando:'Em conferência', aberto:`${pagas.length}/${its.length} pagas` }[st]}</span></span></div>`;
    }).join('');
    const p = x.total ? Math.round(recebido / x.total * 1000) / 10 : 0;
    return `<div class="plan">
      <h4>🛠️ ${esc(x.nome)} <span class="pill">${ids.length} unidade${ids.length>1?'s':''}</span></h4>
      ${x.descricao ? `<p class="hint" style="margin-top:-6px">${esc(x.descricao)}</p>` : ''}
      <div class="kv" style="margin-top:10px"><span>Total</span><b class="mono">${brl(x.total)}</b><span>Por unidade</span><div class="mono">${x.modo === 'fixo' ? brl(x.valorInformado) + ' (valor fixo)' : brl(Math.max(...Object.values(x.unidades))) + ' (' + brl(x.valorInformado) + ' dividido entre ' + ids.length + ')'}</div>
        <span>Parcelas</span><div>${x.parcelas}x · 1º vencimento ${fmtD(x.venc1)}</div><span>Recebido</span><div class="mono">${brl(recebido)} · ${quitadas} de ${ids.length} unidades quitaram</div></div>
      <div class="bar" style="background:var(--line);margin-top:12px"><i style="width:${p}%;background:linear-gradient(90deg,#f6a33a,#ffd27a)"></i></div>
      <details style="margin-top:12px"><summary class="hint" style="cursor:pointer">Ver unidades</summary><div style="margin-top:8px">${linhas}</div></details>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-wa btn-sm" data-avisar-extra="${x.id}">${I.wa} Avisar os moradores</button><button class="btn btn-bad btn-sm" data-del-extra="${x.id}">Excluir cobrança</button></div>
    </div>`;
  }).join('');
  return `${cab('Melhorias e extras', 'Cobranças extras do condomínio, como pintura ou reforma. Aparecem como "Melhorias / Extras" nas parcelas de cada unidade incluída.')}
    <form id="fextra" class="plan">
      <h4>${I.tool} Nova cobrança extra</h4>
      <div class="grid3 m1">
        <div class="field span2"><label>Nome</label><input class="inp" name="nome" maxlength="60" placeholder="Ex.: Pintura da fachada"></div>
        <div class="field"><label>Vencimento da 1ª parcela</label><input class="inp" type="date" name="venc1" value="${vencPadrao}"></div>
        <div class="field span3"><label>Descrição (opcional, os moradores veem)</label><input class="inp" name="descricao" maxlength="400" placeholder="Ex.: Pintura externa do prédio aprovada em reunião"></div>
      </div>
      <div class="radio" style="margin-top:14px">
        <label><input type="radio" name="modo" value="dividir" checked><span><b>Dividir um valor total</b><br><span class="hint">Ex.: R$ 12.000 divididos entre as unidades marcadas</span></span></label>
        <label><input type="radio" name="modo" value="fixo"><span><b>Mesmo valor para cada unidade</b><br><span class="hint">Ex.: R$ 500 por unidade</span></span></label>
      </div>
      <div class="grid3" style="margin-top:14px">
        <div class="field"><label id="lblValor">Valor total (R$)</label><input class="inp" name="valor" inputmode="decimal" placeholder="12000"></div>
        <div class="field"><label>Parcelas</label><select class="inp" name="parcelas">${[1,2,3,4,5,6,8,10,12,18,24].map(n => `<option value="${n}">${n === 1 ? 'À vista (1x)' : n + 'x mensais'}</option>`).join('')}</select></div>
      </div>
      <div class="field" style="margin-top:14px"><label>Unidades que pagam</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="btn btn-ghost btn-sm" data-marcar="todas">Marcar todas</button><button type="button" class="btn btn-ghost btn-sm" data-marcar="cad">Só as cadastradas 🔐</button><button type="button" class="btn btn-ghost btn-sm" data-marcar="nenhuma">Nenhuma</button></div>
        <div class="chips-sel">${S.unidades.map(u => `<label><input type="checkbox" name="un" value="${u.id}" ${temCad ? (cadastrada(u) ? 'checked' : '') : 'checked'}>${esc(u.nome)}${cadastrada(u) ? ' 🔐' : ''}</label>`).join('')}</div>
        <p class="hint" style="margin-top:6px">🔐 = dono já cadastrado no app (criou a senha). ${temCad ? 'Começa marcando só as cadastradas.' : 'Nenhum dono cadastrado ainda: todas começam marcadas.'}</p>
      </div>
      <div class="chk-sum ok" id="prevExtra" style="margin-top:14px">Preencha o valor para ver a divisão.</div>
      <button class="btn btn-sun btn-block" style="margin-top:14px">${I.check} Criar cobrança</button>
    </form>
    <div class="section-t"><h3>Cobranças criadas</h3><span>${ex.length}</span></div>
    ${lista || '<div class="panel empty"><b>🛠️</b>Nenhuma cobrança extra ainda.</div>'}`;
}
function lerFormExtra(){
  const f = $('#fextra');
  const unidades = $$('[name=un]:checked', f).map(x => x.value);
  return { nome: f.nome.value.trim(), descricao: f.descricao.value.trim(), venc1: f.venc1.value, modo: $('[name=modo]:checked', f).value, valor: num(f.valor.value), parcelas: Number(f.parcelas.value), unidades };
}
function prepararExtras(){
  const f = $('#fextra');
  const previa = () => {
    const x = lerFormExtra(), n = x.unidades.length;
    $('#lblValor').textContent = x.modo === 'fixo' ? 'Valor por unidade (R$)' : 'Valor total (R$)';
    const el = $('#prevExtra');
    if (!(x.valor > 0) || !n){ el.className = 'chk-sum diff'; el.textContent = !n ? 'Marque pelo menos uma unidade.' : 'Preencha o valor para ver a divisão.'; return; }
    const porU = x.modo === 'fixo' ? x.valor : x.valor / n, total = x.modo === 'fixo' ? x.valor * n : x.valor;
    el.className = 'chk-sum ok';
    el.innerHTML = `${n} unidade${n>1?'s':''} · <b>${brl(porU)} por unidade</b>${x.parcelas > 1 ? ` em ${x.parcelas} parcelas de ${brl(porU / x.parcelas)}` : ' à vista'} · total ${brl(total)}${x.modo === 'dividir' && Math.round(porU*100) !== porU*100 ? '<br><span class="hint">Os centavos que sobram da divisão vão para as primeiras unidades, para fechar o total exato.</span>' : ''}`;
  };
  f.addEventListener('input', previa); f.addEventListener('change', previa); previa();
  $$('[data-marcar]', f).forEach(b => b.onclick = () => { $$('[name=un]', f).forEach(c => { const u = unidade(c.value); c.checked = b.dataset.marcar === 'todas' || (b.dataset.marcar === 'cad' && cadastrada(u)); }); previa(); });
  f.onsubmit = e => { e.preventDefault();
    const x = lerFormExtra();
    if (!x.nome) return toast('Dê um nome para a cobrança.');
    if (!(x.valor > 0)) return toast('Informe o valor.');
    if (!x.unidades.length) return toast('Marque pelo menos uma unidade.');
    ocupado(e.submitter, async () => {
      const r = await apiAdmin('extra', { extra:x });
      await render();
      toast('✅ Cobrança criada');
      modal(`<div class="okbig">🛠️</div><h3 style="text-align:center">Cobrança criada</h3><p class="hint" style="text-align:center">"${esc(r.extra.nome)}" já aparece nas parcelas das ${Object.keys(r.extra.unidades).length} unidades marcadas.</p>
        <button class="btn btn-wa btn-block" style="margin-top:16px" data-av>${I.wa} Avisar os moradores agora</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Depois</button>`,
        ov => { $('[data-av]', ov).onclick = () => { fecharModal(); avisarExtra(r.extra.id); }; });
    });
  };
}
const msgExtra = (u, x) => `🛠️ *${x.nome}*\n\nOlá, ${u.nome}!${x.descricao ? `\n${x.descricao}` : ''}\n\nValor da sua unidade: *${brl(x.unidades[u.id])}*${x.parcelas > 1 ? ` em ${x.parcelas} parcelas de ${brl(x.unidades[u.id] / x.parcelas)}` : ''}\n📅 1º vencimento: ${fmtD(x.venc1)}\n\nJá aparece no app em "Melhorias / Extras" para pagar com Pix:\n${linkApp()}${assinatura()}`;
function avisarExtra(id){
  const x = (S.extras || []).find(e => e.id === id); if (!x) return;
  loteWhats(Object.keys(x.unidades).map(uid => unidade(uid)).filter(Boolean).map(u => ({ u, texto: msgExtra(u, x) })), 'Aviso da cobrança extra');
}
// manda uma mensagem para várias unidades: automático pela PAPI ou um por um no WhatsApp
function loteWhats(fila, titulo){
  if (!fila.length) return;
  if (ADM.integracoes.papi){
    return ocupado(null, async () => {
      let ok = 0;
      for (const { u, texto } of fila){ if (!u.whats) continue; try { const r = await apiAdmin('whats', { fone:u.whats, texto }); if (r.ok) ok++; } catch(e){} }
      toast(`✅ ${ok} de ${fila.length} mensagens enviadas pelo WhatsApp automático${ok < fila.length ? ' (unidades sem WhatsApp ficaram de fora)' : ''}`);
    });
  }
  let i = 0;
  const passo = () => { const { u, texto } = fila[i];
    modal(`<h3>${esc(titulo)} ${i+1} de ${fila.length}</h3><p class="hint">O WhatsApp abre com a mensagem pronta.</p>
      <div class="row-card" style="margin-top:14px"><div class="mid"><b>${esc(u.nome)}</b><p>${u.whats ? esc(u.whats) : 'Sem número: você escolhe o contato'}</p></div></div>
      <button class="btn btn-wa btn-block" style="margin-top:14px" data-go>${I.wa} Abrir WhatsApp</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-pular>${i+1 < fila.length ? 'Pular este' : 'Fechar'}</button>`, ov => {
      $('[data-go]', ov).onclick = () => { abrirWhats(u.whats, texto); i++; i < fila.length ? passo() : (fecharModal(), toast('Pronto! Todas as mensagens abertas.')); };
      $('[data-pular]', ov).onclick = () => { i++; i < fila.length ? passo() : fecharModal(); };
    });
  };
  passo();
}
async function excluirExtra(id){
  const x = (S.extras || []).find(e => e.id === id); if (!x) return;
  if (!confirm(`Excluir a cobrança "${x.nome}"? Ela some das parcelas de todas as unidades.`)) return;
  try { await apiAdmin('removerExtra', { id }); }
  catch(e){
    if (!/já pagaram/.test(e.message)) return toast(e.message);
    if (!confirm(e.message)) return;
    try { await apiAdmin('removerExtra', { id, forcar:true }); } catch(e2){ return toast(e2.message); }
  }
  toast('Cobrança excluída'); render();
}
function menuMais(){
  if (indiv()) return modal(`<h3>Mais opções</h3><div class="list" style="margin-top:12px">
    <a class="item" href="#/admin/dados"><div class="gi C">👤</div><div class="mid"><b>Meus dados</b><span>Dados do locador e Pix das reservas</span></div>${I.next}</a>
    <a class="item" href="#/admin/ajustes"><div class="gi C">⚙️</div><div class="mid"><b>Ajustes</b><span>WhatsApp, assinatura, capa, senha</span></div>${I.next}</a>
    <a class="item" href="/" target="_blank"><div class="gi R">🏖️</div><div class="mid"><b>Ver o site</b><span>Como o hóspede vê</span></div>${I.next}</a>
  </div><button class="btn btn-ghost btn-block" style="margin-top:14px" data-fechar>Fechar</button>`);
  modal(`<h3>Mais opções</h3><div class="list" style="margin-top:12px">
    <a class="item" href="#/admin/anuncios"><div class="gi R">🎁</div><div class="mid"><b>Anúncios do site</b><span>Popup de ofertas e textos da capa</span></div>${I.next}</a>
    <a class="item" href="#/admin/extras"><div class="gi X">🛠️</div><div class="mid"><b>Melhorias e extras</b><span>Cobranças extras como pintura</span></div>${I.next}</a>
    <a class="item" href="#/admin/valores"><div class="gi M">💵</div><div class="mid"><b>Valores e datas</b><span>Parcelas, condomínio e reajustes</span></div>${I.next}</a>
    <a class="item" href="#/admin/ajustes"><div class="gi C">⚙️</div><div class="mid"><b>Ajustes</b><span>Pix, WhatsApp, capa, senha</span></div>${I.next}</a>
    <a class="item" href="/" target="_blank"><div class="gi R">🏖️</div><div class="mid"><b>Ver o site</b><span>Vitrine de temporada</span></div>${I.next}</a>
  </div><button class="btn btn-ghost btn-block" style="margin-top:14px" data-fechar>Fechar</button>`);
}
function paginaAjustes(){
  const it = ADM.integracoes, c = S;
  const linha = (ok, nome, txt) => `<div class="integ"><span class="d" style="background:${ok ? 'var(--ok)' : 'var(--warn)'}"></span><div style="flex:1"><b>${nome}</b><div class="hint">${txt}</div></div></div>`;
  return `${cab('Ajustes', indiv() ? 'WhatsApp, assinatura dos contratos, capa do site e acesso.' : 'Pix das parcelas, WhatsApp, assinatura, capa do site e acesso.')}
    <div class="plan"><h4>🔌 Integrações (variáveis da Vercel)</h4>
      ${linha(it.redis, 'Banco de dados (Upstash Redis)', it.redis ? 'Conectado' : 'Não conectado: no teste local os dados ficam num arquivo')}
      ${linha(it.blob, 'Arquivos (Vercel Blob)', it.blob ? 'Conectado: documentos guardados com criptografia' : 'Não conectado: conecte para guardar fotos e documentos')}
      ${linha(it.papi, 'WhatsApp automático (PAPI)', it.papi ? `Ligado na instância "${esc(it.papiInstancia)}"` : 'Desligado: os botões abrem o WhatsApp com a mensagem pronta')}
      ${linha(it.autentique, 'Assinatura (Autentique)', it.autentique ? (it.autentiqueTeste ? 'Ligada em MODO DE TESTE (documentos sem valor). Para valer: AUTENTIQUE_SANDBOX = 0' : 'Ligada valendo') : 'Desligada: os contratos são assinados pelo gov.br')}
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-testar>${I.wa} Testar WhatsApp para o proprietário</button></div>
    <form id="faj">
      ${indiv() ? '' : `<div class="plan"><h4>${I.pix} Pix das parcelas (recebedor do condomínio)</h4>
        <div class="grid3 m1">
          <div class="field span3"><label>Cole um Pix copia e cola (eu preencho)</label><input class="inp" id="pxCola" placeholder="00020126..."></div>
          <div class="field span2"><label>Chave Pix</label><input class="inp" name="pxChave" value="${esc(c.pix.chave)}"></div>
          <div class="field"><label>Nome do recebedor</label><input class="inp" name="pxNome" maxlength="25" value="${esc(c.pix.nome)}"></div>
          <div class="field"><label>Cidade</label><input class="inp" name="pxCidade" maxlength="15" value="${esc(c.pix.cidade)}"></div>
        </div><p class="hint" style="margin-top:8px">Modelo para a apresentação: Pix de Clalbo Martins. Troque pela chave do proprietário antes de usar de verdade.</p></div>`}
      <div class="plan"><h4>${I.wa} Proprietário</h4>
        <div class="grid3 m1"><div class="field"><label>Nome</label><input class="inp" name="dnNome" value="${esc(c.dono.nome)}"></div>
        <div class="field"><label>WhatsApp (recebe avisos e o código de recuperação)</label><input class="inp" name="dnWhats" inputmode="tel" value="${esc(c.dono.whats)}"></div></div></div>
      <div class="plan"><h4>${I.beach} Temporada</h4>
        <div class="grid3 m1">
          <div class="field"><label>Prazo da pré-reserva (horas)</label><input class="inp" name="prazo" inputmode="numeric" value="${c.prazoPreHoras}"></div>
          <div class="field span2"><label>Assinatura padrão dos contratos</label><select class="inp" name="assin"><option value="autentique" ${c.assinatura!=='govbr'?'selected':''}>Autentique (quando ligada)</option><option value="govbr" ${c.assinatura==='govbr'?'selected':''}>gov.br</option><option value="aceite" ${c.assinatura==='aceite'?'selected':''}>Aceite por código no WhatsApp (precisa da PAPI)</option></select></div>
          <div class="field span3"><label>Street View do prédio (Google Maps > Compartilhar > Incorporar um mapa > copiar HTML)</label><textarea class="inp" name="sv" rows="3" placeholder='<iframe src="https://www.google.com/maps/embed?pb=...'>${esc(c.streetview ? `<iframe src="${c.streetview}"></iframe>` : '')}</textarea></div>
        </div></div>
      <div class="plan"><h4>🏢 ${indiv() ? "Prédio (endereço e foro dos contratos)" : "Condomínio"}</h4>
        <div class="grid3 m1"><div class="field"><label>Nome</label><input class="inp" name="cdNome" value="${esc(c.cond.nome)}"></div>
        <div class="field span2"><label>Endereço</label><input class="inp" name="cdEnd" value="${esc(c.cond.endereco)}"></div>
        <div class="field"><label>Foro dos contratos (comarca)</label><input class="inp" name="cdForo" value="${esc(c.cond.comarca)}"></div></div></div>
      <button class="btn btn-sun btn-block" style="margin-top:16px">${I.check} Salvar ajustes</button>
    </form>
    <div class="plan"><h4>🖼️ Fotos da capa do site</h4>
      <p class="hint">Até 8 fotos. São as fotos comuns da pousada: aparecem em todas as unidades, depois das fotos próprias de cada uma.</p>
      <div class="photos">${ADM.capa.map(f => `<div class="ph"><img src="${esc(f)}" alt=""><button class="x" data-delcapa="${esc(f)}" aria-label="Remover">✕</button></div>`).join('')}</div>
      <label class="btn btn-ghost btn-sm" style="margin-top:12px">＋ Adicionar fotos<input type="file" accept="image/*" multiple id="upCapa" hidden></label></div>
    <div class="plan"><h4>${I.lock} Acesso e dados</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-trocar-senha>Trocar senha do painel</button>${indiv() ? '' : '<button class="btn btn-ghost btn-sm" data-csv>⬇️ Planilha das parcelas (CSV)</button>'}<button class="btn btn-ghost btn-sm" data-backup>⬇️ Backup (JSON)</button></div>
      ${indiv() ? '</div>' : `<div class="grid3 m1" style="margin-top:14px"><div class="field"><label>Simular a data de hoje (só nesta tela)</label><input class="inp" type="date" id="hjSim" value="${esc(hojeSim)}"></div><div class="field" style="justify-content:flex-end"><button class="btn btn-ghost" data-aplicar-data>Aplicar</button></div></div>
      <p class="hint" style="margin-top:6px">Serve para mostrar como ficam os avisos e atrasos. Não muda nada para os donos.</p></div>`}`;
}
function prepararAjustes(){
  const f = $('#faj');
  $('#pxCola') && ($('#pxCola').oninput = e => { const r = lerPixCola(e.target.value); if (!r) return; f.pxChave.value = r.chave; f.pxNome.value = r.nome; f.pxCidade.value = r.cidade; toast('Pix lido: confira e salve'); });
  f.onsubmit = e => { e.preventDefault(); const g = (n) => f[n].value.trim();
    const config = { ...(f.pxChave ? { pix:{ chave:g('pxChave'), nome:g('pxNome'), cidade:g('pxCidade') } } : {}), dono:{ nome:g('dnNome'), whats:g('dnWhats') }, prazoPreHoras:num(g('prazo')), assinatura:g('assin'), streetview:g('sv'), cond:{ nome:g('cdNome'), endereco:g('cdEnd'), comarca:g('cdForo') } };
    ocupado(e.submitter, async () => { const r = await apiAdmin('config', { config }); ADM.config = r.config; toast('✅ Ajustes salvos'); render(); }); };
  $('#upCapa').onchange = async (e) => { for (const file of e.target.files){ try { const a = await prepararArquivo(file, { maxLado:2000, qualidade:.82 }); const r = await apiAdmin('capaFoto', { dados:a.dados, tipo:a.tipo }); ADM.capa = r.capa; } catch(err){ toast(err.message); break; } } render(); };
}
function exportarCSV(){
  const linhas = [['Unidade','Tipo','Grupo','Parcela','Vencimento','Valor','Status','Informado em','Baixa em']];
  for (const u of S.unidades) for (const it of itensDe(u)){ const r = S.pag[u.id]?.[it.k] || {}; linhas.push([u.nome, S.planos[u.tipo].nome, GRUPOS[it.g].nome, it.titulo, fmtD(it.venc), it.valor.toFixed(2).replace('.',','), rotulo(it), r.inf ? fmtDH(r.inf) : '', r.conf ? fmtDH(r.conf) : '']); }
  baixar(`parcelas-lua-sol-e-mar-${hoje()}.csv`, '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8');
}
function baixar(nome, conteudo, tipo){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }

/* =========================================================
   CLIQUES
   ========================================================= */
document.addEventListener('click', async e => {
  const t = e.target, p = rota();
  const ir = t.closest('[data-ir]'); if (ir){ location.hash = ir.dataset.ir; return; }
  const tt = t.closest('[data-tab-t]'); if (tt) estT.aba = tt.dataset.tabT;
  if (t.closest('[data-sair-dono]')) return sairDono();
  if (t.closest('[data-sair-adm]')) return sairAdmin();
  // parcelas (área do dono)
  if (p[0] === 'dono' && !p[1]){
    const aba = t.closest('[data-aba]'); if (aba){ estP.aba = aba.dataset.aba; estP.ano = null; app.innerHTML = moldura('', telaParcelas()); return posRender(''); }
    const ano = t.closest('[data-ano]'); if (ano){ estP.ano = ano.dataset.ano; app.innerHTML = moldura('', telaParcelas()); return posRender(''); }
    const it = t.closest('[data-it]');
    if (it){ const k = it.dataset.it;
      if (it.querySelector('[data-chk]') && (t.closest('[data-chk]') || estP.sel.size)){ estP.sel.has(k) ? estP.sel.delete(k) : estP.sel.add(k); app.innerHTML = moldura('', telaParcelas()); return posRender(''); }
      return abrirPagamento([k]); }
    if (t.closest('[data-pagar-sel]')) return abrirPagamento([...estP.sel]);
    if (t.closest('[data-limpar-sel]')){ estP.sel.clear(); app.innerHTML = moldura('', telaParcelas()); return posRender(''); }
    if (t.closest('[data-pagar-agora]')){
      const u = S.unidades[0], ab = itensDe(u).filter(i => ['vencido','vence','aberto','futuro'].includes(i.st)).sort((a,b)=>a.venc.localeCompare(b.venc));
      const prox = ab.find(i => i.st !== 'vencido');
      return abrirPagamento(ab.filter(i => i.st === 'vencido' || (prox && i.venc.slice(0,7) === prox.venc.slice(0,7))).map(i => i.k));
    }
    if (t.closest('[data-falar-adm]')) return abrirWhats(S.dono.whats, `Olá! Aqui é do ${S.unidades[0].nome} (${S.cond.curto}). `);
  }
  if (p[0] !== 'admin') return;
  // painel do proprietário
  if (p[1] === 'unidade' && !p[3]){
    const u = unidadeSlug(p[2]);
    const ua = t.closest('[data-uaba]'); if (ua){ estU.aba = ua.dataset.uaba; return render(); }
    const it = t.closest('[data-it]'); if (it && u) return acaoItemDono(u, it.dataset.it);
  }
  const cf = t.closest('[data-conferir]'); if (cf){ const g = _grupos[+cf.dataset.conferir]; if (g) darBaixa(g.u, g.its.map(i => i.k)); return; }
  const rc = t.closest('[data-recusar]'); if (rc){ const g = _grupos[+rc.dataset.recusar]; if (!g) return;
    return ocupado(rc, async () => { const r = await apiAdmin('recusar', { u:g.u.id, keys:g.its.map(i => i.k) }); aplicarUnidade(g.u.id, r.parcelas); render();
      toast(`${g.u.nome}: voltou para em aberto`, { txt:'Avisar o dono', fn: () => enviarWhats(g.u.whats, `Olá, ${g.u.nome}! 🙏\n\nAinda não localizamos o seu Pix de ${brl(g.its.reduce((a,b)=>a+b.valor,0))} (${g.its.map(i=>i.titulo).join(', ')}).\n\nPode nos mandar o comprovante por aqui?${assinatura()}`) }); }); }
  const av = t.closest('[data-aviso]'); if (av){ const u = unidade(av.dataset.u); if (u) enviarAviso(u, av.dataset.aviso); return; }
  const lt = t.closest('[data-lote]'); if (lt) return avisoLote(lt.dataset.lote);
  if (t.closest('[data-salvar-valores]')) return salvarValores(t.closest('[data-salvar-valores]'));
  if (t.closest('[data-mais]')) return menuMais();
  const ar = t.closest('[data-add-reaj]'); if (ar){ ar.closest('.field').querySelector('[data-reaj]').insertAdjacentHTML('beforeend', linhaReajuste()); return; }
  const dr = t.closest('[data-del-reaj]'); if (dr){ dr.closest('[data-rj]').remove(); return; }
  const ae = t.closest('[data-avisar-extra]'); if (ae) return avisarExtra(ae.dataset.avisarExtra);
  const de = t.closest('[data-del-extra]'); if (de) return excluirExtra(de.dataset.delExtra);
  if (t.closest('[data-testar]')) return enviarWhats(S.dono.whats, `✅ Teste do app ${S.cond.curto}\n\nSe você recebeu esta mensagem, os avisos estão funcionando.`);
  if (t.closest('[data-trocar-senha]')) return pedirNovaSenha(false);
  if (t.closest('[data-csv]')) return exportarCSV();
  if (t.closest('[data-backup]')) return baixar(`backup-lua-sol-e-mar-${hoje()}.json`, JSON.stringify({ config:ADM.config, parcelas:ADM.pags, reservas:ADM.reservas }, null, 2), 'application/json');
  if (t.closest('[data-aplicar-data]')){ hojeSim = $('#hjSim').value; toast(hojeSim ? 'Simulando ' + fmtD(hojeSim) : 'Usando a data real'); return render(); }
  if (t.closest('[data-sem-sim]')){ hojeSim = ''; return render(); }
  const dc = t.closest('[data-delcapa]'); if (dc && confirm('Remover esta foto da capa?')) return ocupado(null, async () => { const r = await apiAdmin('removerCapa', { url:dc.dataset.delcapa }); ADM.capa = r.capa; render(); });
});

render();
