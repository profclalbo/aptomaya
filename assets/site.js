/* Site de temporada: vitrine, página da unidade, reserva e acompanhamento */
'use strict';

const app = $('#app');
let V = null;              // dados da vitrine
let busca = { ci:'', co:'', h:2, tipo:'todos' };
let tCarrossel = null;
const GOVBR_ASSINADOR = 'https://assinador.iti.br';
let SITE = null, MODO = 'condominio';   // textos do site e tipo (geral da pousada ou individual)
const individualS = () => MODO === 'individual';
function guardarSite(d){
  if (d?.site) SITE = d.site;
  if (d?.modo) MODO = d.modo;
  if (individualS() && SITE?.marca) document.title = `${SITE.marca} - Temporada pé na areia em Itanhaém`;
}
const marcaHtml = () => individualS()
  ? `<span>${esc(SITE?.marca || 'Lua Sol e Mar')}<small>Pousada Lua Sol e Mar · Itanhaém</small></span>`
  : `<span>${esc(SITE?.marca || 'Lua Sol e Mar')}<small>Temporada em Itanhaém</small></span>`;
const linkDono = () => individualS() ? '/app#/admin' : '/app';

function rota(){
  const [cam, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const p = cam.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  if (p[0] === 'unidade' && p[1]) return { v:'unidade', s:p[1], q };
  if (p[0] === 'reservar' && p[1]) return { v:'reservar', s:p[1], q };
  if (p[0] === 'reserva' && p[1] && p[2]) return { v:'reserva', id:p[1], t:p[2] };
  return { v:'vitrine' };
}
const topo = (voltar) => `<div class="topbar"><div class="topbar-in">
  ${voltar ? `<a class="back" href="${voltar}">${I.back} Voltar</a>` : ''}
  <a class="brand" href="#/"><span class="brand-mark">${I.logo}</span>${marcaHtml()}</a>
  ${botaoTema()}</div></div>`;

let versao = 0;
const velha = (v) => v !== versao;
async function render(){
  clearInterval(tCarrossel);
  const v = ++versao;
  if (rota().v !== 'vitrine') { fecharPromo(); $('#ofertas')?.remove(); }
  const r = rota();
  try {
    if (r.v === 'vitrine') await telaVitrine(v);
    else if (r.v === 'unidade') await telaUnidade(r.s, r.q, v);
    else if (r.v === 'reservar') await telaReservar(r.s, r.q, v);
    else if (r.v === 'reserva') await telaReserva(r.id, r.t, v);
  } catch(e){
    if (velha(v)) return;
    app.innerHTML = `${topo('#/')}<div class="wrap"><div class="empty"><b>😕</b>${esc(e.message)}<br><br><a class="btn btn-ghost" href="#/">Voltar ao início</a></div></div>`;
  }
}
window.addEventListener('hashchange', () => { fecharModal(); render().then(() => window.scrollTo(0, 0)); });

/* =========================================================
   VITRINE
   ========================================================= */
function disponivel(u){
  if (!busca.ci || !busca.co || busca.co <= busca.ci) return { ok:true };
  const oc = new Set(u.ocupadas);
  const livre = noitesEntre(busca.ci, busca.co).every(d => !oc.has(d));
  const n = dias(busca.ci, busca.co);
  if (!livre) return { ok:false, motivo:'Indisponível nas datas' };
  const pk = pacotesNoPeriodo(u, busca.ci, busca.co)[0];
  const ehPacote = pk && pk.ini === busca.ci && pk.fim === busca.co;
  if (pk && !ehPacote) return { ok:false, motivo:`Só o pacote ${pk.nome} completo`, pacote:pk };
  if (!ehPacote && n < (u.minNoites || 1)) return { ok:false, motivo:`Mínimo ${u.minNoites} noites` };
  if (busca.h > u.capacidade) return { ok:false, motivo:`Até ${u.capacidade} hóspedes` };
  return { ok:true, v: calcularValores(u, busca.ci, busca.co, { pagantes: busca.h }) };
}
// pacotes (Natal, Réveillon...) de todas as unidades, sem repetir, só os que ainda não passaram
function pacotesDoSite(){
  const m = new Map();
  for (const u of V?.unidades || []) for (const p of pacotesAtivos(u)) if (p.fim > V.hoje && !m.has(p.nome + p.ini)) m.set(p.nome + p.ini, p);
  return [...m.values()].sort((a, b) => a.ini.localeCompare(b.ini));
}
const emojiPacote = (nome) => /natal/i.test(nome) ? '🎄' : /r[eé]veillon|ano novo/i.test(nome) ? '🎆' : /carnaval/i.test(nome) ? '🎭' : '🎁';
function cardUnidade(u){
  const d = disponivel(u);
  const link = `#/unidade/${u.slug}` + (d.pacote ? `?ci=${d.pacote.ini}&co=${d.pacote.fim}&h=${busca.h}` : busca.ci && busca.co ? `?ci=${busca.ci}&co=${busca.co}&h=${busca.h}` : '');
  return `<a class="card-u ${d.ok?'':'ind'}" href="${link}">
    <div class="ft"><img loading="lazy" src="${esc(u.fotos[0])}" alt="${esc(u.titulo)}">
      ${!d.ok ? `<span class="badge ind">${esc(d.motivo)}</span>` : (u.comodidades.includes('pe') ? '<span class="badge">🏖️ Pé na areia</span>' : '')}
      ${u.fotos.length > 1 ? `<span class="qt">${u.fotos.length} fotos</span>` : ''}</div>
    <div class="info">
      <div class="l1"><span>${esc(u.titulo)}</span></div>
      <div class="l2">${esc(u.nome)} · ${esc(u.piso)}</div>
      <div class="l2">${u.capacidade} hóspedes · ${u.quartos} quarto${u.quartos==1?'':'s'} · ${u.camas} cama${u.camas==1?'':'s'}</div>
      <div class="pr">${d.ok && d.v ? `<b>${brl(d.v.somaDiarias + d.v.limpeza)}</b> <span class="hint">${d.v.pacote ? `pacote ${esc(d.v.pacote.nome)} · ${busca.h} pessoa${busca.h>1?'s':''}` : `por ${d.v.noites} noite${d.v.noites>1?'s':''}`}</span>` : `<b>${brl(u.diaria)}</b> <span class="hint">noite</span>`}</div>
      ${d.ok && d.v && d.v.restante > 0 ? `<div class="hint">Sinal de ${d.v.sinalPct}% no Pix: <b>${brl(d.v.sinal)}</b></div>` : ''}
    </div></a>`;
}
async function telaVitrine(vr = versao){
  if (!V) V = await api('/api/publico?acao=vitrine');
  if (velha(vr)) return;
  guardarSite(V);
  const st = SITE || {};
  const tipos = new Set(V.unidades.map(u => u.tipo === 'apto' ? 'apto' : 'kit'));
  if (tipos.size < 2) busca.tipo = 'todos';
  const capMax = Math.max(1, ...V.unidades.map(u => Number(u.capacidade) || 1));
  const pacs = pacotesDoSite();
  const pkBusca = busca.ci && busca.co ? pacs.find(p => noitesEntre(busca.ci, busca.co).some(n => p.ini <= n && n < p.fim)) : null;
  const pkParcial = pkBusca && !(pkBusca.ini === busca.ci && pkBusca.fim === busca.co) ? pkBusca : null;
  const comSinal = V.unidades.some(u => (Number(u.sinalPct) || 100) < 100);
  const pctSinal = Math.min(...V.unidades.map(u => Number(u.sinalPct) || 100));
  const fotos = V.capa.length ? V.capa : ['/assets/fotos/capa1.jpg'];
  const legendas = ['Pé na areia, na Av. Beira Mar', 'Pôr do sol visto da pousada', 'O mar a poucos passos da sua unidade'];
  const hojeV = V.hoje;
  const lista = V.unidades.filter(u => busca.tipo === 'todos' || (busca.tipo === 'apto' ? u.tipo === 'apto' : u.tipo !== 'apto'));
  const ordenada = [...lista].sort((a, b) => Number(disponivel(b).ok) - Number(disponivel(a).ok));
  const nDisp = lista.filter(u => disponivel(u).ok).length;
  app.innerHTML = `
  <header class="hero" id="hero">
    <div class="slides">${fotos.map((f,i)=>`<div class="slide ${i===0?'on':''}"><img src="${esc(f)}" alt="${esc(legendas[i]||'Foto da pousada')}"></div>`).join('')}</div>
    <div class="hero-top">
      <div class="brand"><span class="brand-mark">${I.logo}</span>${marcaHtml()}</div>
      <div style="display:flex;gap:8px">${botaoTema()}<a class="btn btn-ghost btn-sm" href="${linkDono()}">${I.lock} ${individualS() ? 'Proprietário' : 'Área do dono'}</a></div>
    </div>
    <div class="hero-in">
      <span class="kicker">🌊 Itanhaém - SP · Pé na areia</span>
      <h1>${esc(st.titulo || '')} <em>${esc(st.destaque || 'Lua Sol e Mar')}</em></h1>
      <p class="lead">${esc(st.sub || '')}</p>
      <div class="dots">${fotos.map((_,i)=>`<button data-dot="${i}" class="${i===0?'on':''}" aria-label="Foto ${i+1}"></button>`).join('')}</div>
      <form class="busca" id="fbusca">
        <div class="f"><label for="bci">Entrada</label><input id="bci" type="date" min="${hojeV}" value="${busca.ci}"></div>
        <div class="f"><label for="bco">Saída</label><input id="bco" type="date" min="${busca.ci || hojeV}" value="${busca.co}"></div>
        <div class="f h"><label for="bh">Hóspedes</label><select id="bh">${Array.from({length:capMax},(_,i)=>`<option value="${i+1}" ${busca.h===i+1?'selected':''}>${i+1} hóspede${i?'s':''}</option>`).join('')}</select></div>
        <button class="btn btn-sun">Ver disponíveis</button>
      </form>
      ${pacs.length ? `<div class="pac-chips">${pacs.map(p => `<button type="button" class="pac-chip ${busca.ci === p.ini && busca.co === p.fim ? 'on' : ''}" data-pac="${esc(p.ini)}|${esc(p.fim)}">${emojiPacote(p.nome)} ${esc(p.nome)} <small>${fmtCurto(p.ini)} a ${fmtCurto(p.fim)}</small></button>`).join('')}</div>` : ''}
    </div>
  </header>

  <section class="sec" id="lista">
    <h2>${busca.ci && busca.co ? `${nDisp} unidade${nDisp===1?'':'s'} livre${nDisp===1?'':'s'} de ${fmtCurto(busca.ci)} a ${fmtCurto(busca.co)}` : 'Escolha a sua unidade'}</h2>
    <p class="sub">${busca.ci && busca.co ? (comSinal ? `Valor total da estadia. Para reservar, você paga só o sinal no Pix e o restante na chegada.` : 'O valor mostrado já soma as diárias e a limpeza. A caução aparece na página da unidade.') : 'Todas a poucos passos da areia. Toque numa unidade para ver fotos, calendário, regras e valores.'}</p>
    ${pkParcial ? `<div class="alert warn" style="margin-top:12px"><div class="ic">${emojiPacote(pkParcial.nome)}</div><div>De ${fmtD(pkParcial.ini)} a ${fmtD(pkParcial.fim)} as reservas são só no <b>pacote ${esc(pkParcial.nome)}</b> completo.<br><button class="btn btn-sun btn-sm" style="margin-top:8px" data-pac="${esc(pkParcial.ini)}|${esc(pkParcial.fim)}">Ver o pacote ${esc(pkParcial.nome)}</button></div></div>` : ''}
    <div class="filtros">
      ${tipos.size > 1 ? [['todos','Todas'],['apto','Apartamentos'],['kit','Kitnets']].map(([k,t]) => `<button class="tab ${busca.tipo===k?'on':''}" data-tipo="${k}">${t}</button>`).join('') : ''}
      ${busca.ci ? `<button class="btn btn-ghost btn-sm" data-limpar>Limpar datas</button>` : ''}
    </div>
    <div class="cards">${ordenada.length ? ordenada.map(cardUnidade).join('') : '<div class="empty">Nenhuma unidade anunciada no momento.</div>'}</div>
  </section>

  <section class="sec" style="padding-top:8px">
    <h2>Conheça o prédio</h2>
    <p class="sub">${esc(V.cond.praia)}, em ${esc(V.cond.cidade)}. ${V.streetview ? 'Gire a imagem e veja a fachada como se estivesse na rua.' : ''}</p>
    <div class="street" style="margin-top:18px">${V.streetview
      ? `<iframe title="Street View do prédio" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${esc(V.streetview)}"></iframe>`
      : `<iframe title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent('Pousada Lua Sol e Mar, Itanhaém SP')}&z=17&output=embed"></iframe>`}</div>
    <p class="hint" style="margin-top:10px">${I.pin} ${esc(V.cond.endereco)}</p>
  </section>

  <section class="sec" style="padding-top:8px">
    <h2>Como funciona a reserva</h2>
    <div class="passos">
      <div class="passo"><div class="n">1</div><h3>Escolha as datas</h3><p>Veja no calendário o que está livre e o valor exato da estadia.</p></div>
      <div class="passo"><div class="n">2</div><h3>Preencha os dados</h3><p>Nome e documento de cada hóspede, com foto ou PDF do documento.</p></div>
      <div class="passo"><div class="n">3</div><h3>${comSinal ? `Sinal de ${pctSinal}% no Pix` : 'Pague com Pix'}</h3><p>${comSinal ? 'O sinal garante as datas e é descontado do total. O restante você paga no dia da chegada.' : 'As datas ficam guardadas para você enquanto o dono confere o pagamento.'}</p></div>
      <div class="passo"><div class="n">4</div><h3>Assine o contrato</h3><p>O contrato de temporada sai pronto, para assinar pelo celular.</p></div>
    </div>
  </section>
  <footer class="foot">${individualS() ? `${esc(st.marca || '')} · ${esc(V.cond.nome)} · ${esc(V.cond.cidade)}<br><a href="/app#/admin">Área do proprietário</a>` : `${esc(V.cond.nome)} · ${esc(V.cond.cidade)}<br><a href="/app">Área do dono da unidade</a> · <a href="/app#/admin">Administração</a>`}</footer>`;
  montarCarrossel(fotos.length);
  const fb = $('#fbusca');
  $('#bci').onchange = e => { const co = $('#bco'); co.min = e.target.value || hojeV; if (co.value && co.value <= e.target.value) co.value = ''; };
  fb.onsubmit = e => {
    e.preventDefault();
    const ci = $('#bci').value, co = $('#bco').value;
    if ((ci && !co) || (!ci && co)) return toast('Escolha a entrada e a saída.');
    if (ci && co && co <= ci) return toast('A saída precisa ser depois da entrada.');
    busca = { ...busca, ci, co, h: Number($('#bh').value) };
    telaVitrine().then(() => $('#lista').scrollIntoView({ behavior:'smooth' }));
  };
  $$('[data-tipo]').forEach(b => b.onclick = () => { busca.tipo = b.dataset.tipo; telaVitrine().then(() => $('#lista').scrollIntoView()); });
  $('[data-limpar]') && ($('[data-limpar]').onclick = () => { busca = { ...busca, ci:'', co:'' }; telaVitrine().then(() => $('#lista').scrollIntoView()); });
  $$('[data-pac]').forEach(b => b.onclick = () => { const [ci, co] = b.dataset.pac.split('|'); escolherPacoteBusca(ci, co); });
  botaoOfertas();
  if (!busca.ci && !busca.co) agendarPromo();
}
function escolherPacoteBusca(ci, co){
  fecharPromo();
  busca = { ...busca, ci, co, tipo:'todos' };
  telaVitrine().then(() => $('#lista')?.scrollIntoView({ behavior:'smooth' }));
}

/* ---------- popup de anúncios (Natal, Réveillon, apartamentos, kitnets) ---------- */
let tPromo = null, promoAberto = false;
const promoItens = () => (V?.popup?.ativo === false ? [] : (V?.popup?.itens || []));
function promoJaVisto(){ try { return sessionStorage.getItem('lsm_promo') === '1'; } catch(_){ return false; } }
function marcarPromo(){ try { sessionStorage.setItem('lsm_promo', '1'); } catch(_){} }
function agendarPromo(){
  if (promoJaVisto() || !promoItens().length) return;
  marcarPromo();
  // começa num anúncio diferente a cada visita
  let k = 0; try { k = (Number(localStorage.getItem('lsm_promo_i')) || 0) % promoItens().length; localStorage.setItem('lsm_promo_i', String(k + 1)); } catch(_){}
  setTimeout(() => { if (rota().v === 'vitrine' && !busca.ci && !$('.modal-ov')) abrirPromo(k, true); }, 700);
}
function textoAcao(acao){
  if (acao === 'tipo:apto') return 'Ver apartamentos';
  if (acao === 'tipo:kit') return 'Ver kitnets';
  if (String(acao).startsWith('pacote:')) return 'Ver pacote ' + acao.slice(7);
  return 'Escolher as datas';
}
function fazerAcao(acao){
  fecharPromo();
  if (acao === 'tipo:apto' || acao === 'tipo:kit'){ busca.tipo = acao.slice(5); telaVitrine().then(() => $('#lista')?.scrollIntoView({ behavior:'smooth' })); return; }
  if (String(acao).startsWith('pacote:')){
    const nome = acao.slice(7).toLowerCase();
    const p = pacotesDoSite().find(x => x.nome.toLowerCase() === nome) || pacotesDoSite().find(x => x.nome.toLowerCase().includes(nome));
    if (p) return escolherPacoteBusca(p.ini, p.fim);
  }
  const f = $('#fbusca'); f && f.scrollIntoView({ behavior:'smooth', block:'center' });
  setTimeout(() => { const i = $('#bci'); if (!i) return; i.focus(); try { i.showPicker && i.showPicker(); } catch(_){} }, 350);
}
function abrirPromo(k = 0, auto = false){
  const itens = promoItens(); if (!itens.length) return;
  fecharPromo();
  promoAberto = true;
  let at = k % itens.length;
  const seg = Math.min(10, Math.max(2, Number(V.popup?.segundos) || 3.5));
  const ov = document.createElement('div');
  ov.className = 'promo-ov'; ov.id = 'promo';
  ov.innerHTML = `<div class="promo" role="dialog" aria-label="Ofertas">
    ${auto ? '<div class="tempo" id="promoTempo" style="width:100%"></div>' : ''}
    <button class="fechar" data-fpromo aria-label="Fechar">✕</button>
    ${itens.length > 1 ? `<button class="nav e" data-pnav="-1" aria-label="Anterior">‹</button><button class="nav d" data-pnav="1" aria-label="Próximo">›</button>` : ''}
    <img id="promoImg" alt="Oferta">
    ${itens.length > 1 ? `<div class="pts">${itens.map((_, i) => `<button data-pdot="${i}" aria-label="Oferta ${i+1}"></button>`).join('')}</div>` : ''}
    <div class="rodape"><button class="btn btn-sun" id="promoAcao"></button><button class="btn btn-ghost" data-fpromo>Agora não</button></div>
  </div>`;
  document.body.appendChild(ov);
  const mostrar = (i) => {
    at = (i + itens.length) % itens.length;
    $('#promoImg', ov).src = itens[at].url;
    $('#promoAcao', ov).textContent = textoAcao(itens[at].acao);
    $$('[data-pdot]', ov).forEach((d, j) => d.classList.toggle('on', j === at));
  };
  mostrar(at);
  // qualquer toque dentro do anúncio para o fechamento automático, para a pessoa olhar com calma
  const parar = () => { clearTimeout(tPromo); tPromo = null; const b = $('#promoTempo', ov); b && b.remove(); };
  if (auto){
    const b = $('#promoTempo', ov);
    requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transition = `width ${seg}s linear`; b.style.width = '0%'; }));
    tPromo = setTimeout(fecharPromo, seg * 1000);
    $('.promo', ov).addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') parar(); });
  }
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-fpromo]')) return fecharPromo();
    const n = e.target.closest('[data-pnav]'); if (n){ parar(); return mostrar(at + Number(n.dataset.pnav)); }
    const d = e.target.closest('[data-pdot]'); if (d){ parar(); return mostrar(Number(d.dataset.pdot)); }
    if (e.target.id === 'promoImg' || e.target.id === 'promoAcao') return fazerAcao(itens[at].acao);
  });
  let x0 = null;
  ov.addEventListener('touchstart', (e) => { parar(); x0 = e.touches[0].clientX; }, { passive:true });
  ov.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) mostrar(at + (dx < 0 ? 1 : -1)); x0 = null; });
}
function fecharPromo(){
  clearTimeout(tPromo); tPromo = null;
  const ov = $('#promo'); if (ov) ov.remove();
  if (promoAberto){ promoAberto = false; botaoOfertas(); }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#promo')) fecharPromo(); });
// botão flutuante: antes das datas abre as ofertas; depois das datas leva para as unidades livres
function botaoOfertas(){
  $('#ofertas')?.remove();
  if (rota().v !== 'vitrine' || !V) return;
  let oculto = false; try { oculto = sessionStorage.getItem('lsm_ofertas_x') === '1'; } catch(_){}
  const comDatas = busca.ci && busca.co;
  if (!comDatas && (oculto || !promoItens().length)) return;
  const livres = comDatas ? V.unidades.filter(u => disponivel(u).ok) : [];
  if (comDatas && !livres.length) return;
  const b = document.createElement('div');
  b.id = 'ofertas';
  b.className = 'ofertas-btn';
  b.setAttribute('role', 'button');
  b.innerHTML = comDatas
    ? (livres.length === 1 ? `✅ Reservar ${esc(livres[0].nome)}` : `✅ Ver ${livres.length} unidades livres`)
    : `🎁 Ofertas <span class="x" data-xof aria-label="Esconder">✕</span>`;
  b.onclick = (e) => {
    if (e.target.closest('[data-xof]')){ try { sessionStorage.setItem('lsm_ofertas_x', '1'); } catch(_){} b.remove(); return; }
    if (!comDatas) return abrirPromo(0, false);
    if (livres.length === 1) location.hash = `#/unidade/${livres[0].slug}?ci=${busca.ci}&co=${busca.co}&h=${busca.h}`;
    else $('#lista')?.scrollIntoView({ behavior:'smooth' });
  };
  document.body.appendChild(b);
}
function montarCarrossel(n){
  const slides = $$('.slide'), dots = $$('[data-dot]'); let at = 0;
  const ir = (k) => { at = (k + n) % n; slides.forEach((s,i)=>s.classList.toggle('on', i===at)); dots.forEach((d,i)=>d.classList.toggle('on', i===at)); };
  const auto = () => { clearInterval(tCarrossel); if (n > 1) tCarrossel = setInterval(() => { if (!document.hidden) ir(at+1); }, 5500); };
  dots.forEach(d => d.onclick = () => { ir(+d.dataset.dot); auto(); });
  let x0 = null; const h = $('#hero');
  h.addEventListener('touchstart', e => { if (!e.target.closest('form')) x0 = e.touches[0].clientX; }, { passive:true });
  h.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50){ ir(at + (dx < 0 ? 1 : -1)); auto(); } x0 = null; });
  auto();
}

/* =========================================================
   PÁGINA DA UNIDADE
   ========================================================= */
let U = null, cal = null, sel = { ci:'', co:'', h:2, cr:0 };
const pacoteSel = () => sel.ci && sel.co ? pacotesAtivos(U).find(p => p.ini === sel.ci && p.fim === sel.co) : null;
const periodoPermitido = (ci, co) => { const p = pacotesNoPeriodo(U, ci, co)[0]; return !p || (p.ini === ci && p.fim === co); };
const listaHtml = (t) => `<ul>${String(t||'').split('\n').map(l => l.trim()).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;
async function telaUnidade(s, q, vr = versao){
  const d = await api('/api/publico?acao=unidade&u=' + encodeURIComponent(s));
  if (velha(vr)) return;
  guardarSite(d);
  U = { ...d.unidade, hoje:d.hoje, prazo:d.prazoPreHoras, comodNomes:d.comodidades, cond:d.cond };
  const oc = new Set(U.ocupadas);
  sel = { ci:'', co:'', h: Math.min(Number(q.h) || busca.h || 2, U.capacidade), cr: Math.max(0, Number(q.cr) || 0) };
  if (q.ci && q.co && q.co > q.ci && q.ci >= U.hoje && noitesEntre(q.ci, q.co).every(x => !oc.has(x)) && periodoPermitido(q.ci, q.co)) { sel.ci = q.ci; sel.co = q.co; }
  const pacsU = pacotesAtivos(U).filter(p => p.fim > U.hoje);
  const f = U.fotos;
  app.innerHTML = `${topo('#/')}
  <div class="wrap-wide" style="padding-bottom:140px">
    <h1 class="h-title" style="font-size:clamp(26px,4vw,34px)">${esc(U.titulo)}</h1>
    <p class="h-sub">${esc(U.nome)} · ${esc(U.piso)} · ${esc(U.cond.nome)}</p>
    <div class="gal-cont"><div class="galeria-m" id="galm">${f.map((x,i)=>`<img src="${esc(x)}" alt="Foto ${i+1}" data-foto="${i}">`).join('')}</div><span class="cont" id="galc">1 / ${f.length}</span></div>
    <div class="galeria" style="${f.length < 3 ? 'grid-template-columns:2fr 1fr;' : ''}">
      ${f.slice(0, 5).map((x,i)=>`<img class="g${i}" src="${esc(x)}" alt="Foto ${i+1}" data-foto="${i}">`).join('')}
      <button class="btn btn-ghost btn-sm todas" style="background:var(--card)" data-todas>Ver todas as ${f.length} fotos</button>
    </div>
    <div class="u-grid">
      <div>
        <div class="bloco" style="padding-top:0">
          <h3 style="font-size:20px">${esc(U.tipoNome)} · até ${U.capacidade} hóspedes</h3>
          <div class="specs"><span>${I.users} ${U.capacidade} hóspedes</span><span>${I.door} ${U.quartos} quarto${U.quartos==1?'':'s'}</span><span>${I.bed} ${U.camas} cama${U.camas==1?'':'s'}</span><span>${I.bath} ${U.banheiros} banheiro${U.banheiros==1?'':'s'}</span></div>
        </div>
        <div class="bloco"><p style="white-space:pre-line">${esc(U.descricao)}</p></div>
        ${pacsU.length ? `<div class="bloco" id="blocoPac"><h3>Pacotes especiais</h3><p class="hint">Nessas datas a reserva é só do pacote completo.</p>
          ${pacsU.map(p => { const livreP = noitesEntre(p.ini, p.fim).every(x => !oc.has(x)); return `<div class="pacote-box">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><b style="font-size:17px">${emojiPacote(p.nome)} ${esc(p.nome)}</b>${livreP ? '' : '<span class="chip st-cancelada"><i></i>Reservado</span>'}</div>
            <div class="hint" style="margin-top:4px">Entrada ${fmtD(p.ini)} às ${esc(p.checkin || U.checkin)} · saída ${fmtD(p.fim)} até ${esc(p.checkout || U.checkout)}</div>
            <div class="sum-row" style="margin-top:8px"><span>Casal</span><b class="mono">${brl(p.casal)}</b></div>
            ${Number(p.acompanhante) ? `<div class="sum-row"><span>Cada acompanhante a partir de ${p.idadeMin || 6} anos (até ${Math.max(0, U.capacidade - 2)})</span><b class="mono">${brl(p.acompanhante)}</b></div>` : ''}
            ${Number(p.limpeza) ? `<div class="sum-row"><span>Taxa de limpeza</span><b class="mono">${brl(p.limpeza)}</b></div>` : ''}
            <div class="hint">Crianças de até ${(p.idadeMin || 6) - 1} anos não pagam.</div>
            ${livreP ? `<button class="btn btn-sun btn-sm" style="margin-top:10px" data-escpac="${esc(p.ini)}|${esc(p.fim)}">Escolher o pacote ${esc(p.nome)}</button>` : ''}
          </div>`; }).join('')}</div>` : ''}
        ${U.comodidades.length ? `<div class="bloco"><h3>O que tem na unidade</h3><div class="comods">${U.comodidades.map(k => `<div><i>${ICONE_COMOD[k]||'✔️'}</i>${esc(U.comodNomes[k])}</div>`).join('')}</div></div>` : ''}
        <div class="bloco" id="blocoCal"><h3>Disponibilidade</h3><p class="hint" style="margin-bottom:12px">Toque na data de entrada e depois na de saída. Os dias riscados já estão ocupados. Mínimo de ${U.minNoites} noite${U.minNoites>1?'s':''}.</p><div id="cal"></div>
          <div class="cal-leg"><span><i style="background:var(--sea)"></i>Sua escolha</span>${pacsU.length ? '<span><i style="background:rgba(246,181,68,.45)"></i>Pacote (só o período inteiro)</span>' : ''}<span><i style="background:repeating-linear-gradient(135deg,var(--line2) 0 3px,transparent 3px 6px)"></i>Ocupado</span>${Number(U.diariaFds)>0?`<span>Sexta e sábado: ${brl(U.diariaFds)}</span>`:''}</div></div>
        ${U.regras ? `<div class="bloco"><h3>Regras da casa</h3>${listaHtml(U.regras)}<p class="hint" style="margin-top:8px">Entrada a partir das ${esc(U.checkin)} · saída até as ${esc(U.checkout)}</p></div>` : ''}
        ${U.requisitos ? `<div class="bloco"><h3>Requisitos para reservar</h3>${listaHtml(U.requisitos)}</div>` : ''}
        ${U.cancelamento ? `<div class="bloco"><h3>Política de cancelamento</h3>${listaHtml(U.cancelamento)}</div>` : ''}
        ${U.contato ? `<div class="bloco"><h3>Ficou com alguma dúvida?</h3><p class="hint" style="margin-bottom:10px">Fale direto com o proprietário pelo WhatsApp.</p><button class="btn btn-wa" data-falarprop>${I.wa} Falar com o proprietário</button></div>` : ''}
        <div class="bloco" style="border:0"><h3>Onde fica</h3><p>${I.pin} ${esc(U.cond.endereco)}</p></div>
      </div>
      <aside class="reserva-card" id="rcard"></aside>
    </div>
  </div>
  <div class="barra-m" id="barram"></div>`;
  cal = new Calendario($('#cal'), {
    hoje: U.hoje, ocupadas: oc, meses: innerWidth > 760 ? 2 : 1, ci: sel.ci, co: sel.co, minNoites: U.minNoites,
    preco: (d) => precoNoite(U, d), pacotes: pacotesAtivos(U),
    onChange: ({ci, co}) => { sel.ci = ci; sel.co = co; cardReserva(); },
    onErro: (m) => toast(m),
  });
  cardReserva();
  const gm = $('#galm');
  gm.onscroll = () => { $('#galc').textContent = `${Math.round(gm.scrollLeft / gm.clientWidth) + 1} / ${f.length}`; };
  $$('[data-foto]').forEach(i => i.onclick = () => verFotos(+i.dataset.foto));
  $('[data-todas]').onclick = () => verFotos(0);
  $$('[data-escpac]').forEach(b => b.onclick = () => {
    const [ci, co] = b.dataset.escpac.split('|');
    sel.ci = ci; sel.co = co;
    cal.inicio = ci.slice(0, 7); cal.set({ ci, co });
    cardReserva();
    (innerWidth > 960 ? $('#rcard') : $('#blocoCal')).scrollIntoView({ behavior:'smooth', block:'center' });
  });
}
function verFotos(i){
  modal(`<h3>${esc(U.titulo)}</h3><p class="hint" style="margin-bottom:14px">${U.fotos.length} fotos</p><div class="galeria-full">${U.fotos.map((f,k)=>`<img id="ff${k}" src="${esc(f)}" alt="Foto ${k+1}">`).join('')}</div><button class="btn btn-ghost btn-block" data-fechar>Fechar</button>`,
    ov => { const el = $('#ff' + i, ov); el && setTimeout(() => el.scrollIntoView(), 50); }, { larga:true });
}
function cardReserva(){
  const ok = sel.ci && sel.co;
  const pk = pacoteSel();
  if (!pk || sel.cr > sel.h - 1) sel.cr = pk ? Math.min(sel.cr, sel.h - 1) : 0;
  const v = ok ? calcularValores(U, sel.ci, sel.co, { pagantes: sel.h - sel.cr }) : null;
  const idMin = pk ? (Number(pk.idadeMin) || 6) : 6;
  const html = `
    ${pk ? `<div class="chip st-assinatura" style="margin-bottom:8px"><i></i>${emojiPacote(pk.nome)} Pacote ${esc(pk.nome)}</div>` : ''}
    <div class="preco">${v ? brl(v.somaDiarias + v.limpeza) + ' <span>total</span>' : brl(U.diaria) + ' <span>/ noite</span>'}</div>
    <div class="datas">
      <button data-ircal><small>Entrada</small><b>${sel.ci ? fmtD(sel.ci) : 'Escolher'}</b></button>
      <button data-ircal><small>Saída</small><b>${sel.co ? fmtD(sel.co) : 'Escolher'}</b></button>
      <div class="hs"><small>Hóspedes</small><select id="selh">${Array.from({length:U.capacidade},(_,i)=>`<option value="${i+1}" ${sel.h===i+1?'selected':''}>${i+1} hóspede${i?'s':''}</option>`).join('')}</select></div>
      ${pk && sel.h > 1 ? `<div class="hs"><small>Crianças até ${idMin - 1} anos (não pagam)</small><select id="selcr">${Array.from({length:sel.h},(_,i)=>`<option value="${i}" ${sel.cr===i?'selected':''}>${i ? i + ' criança' + (i>1?'s':'') : 'Nenhuma'}</option>`).join('')}</select></div>` : ''}
    </div>
    ${v ? `<div style="margin-top:14px">
      ${v.pacote ? `<div class="sum-row"><span>Pacote ${esc(v.pacote.nome)} (casal) · ${v.noites} noites</span><b class="mono">${brl(v.pacote.casal)}</b></div>
      ${v.pacote.acompanhantes ? `<div class="sum-row"><span>${v.pacote.acompanhantes} acompanhante${v.pacote.acompanhantes>1?'s':''} x ${brl(v.pacote.acompanhante)}</span><b class="mono">${brl(v.pacote.acompanhante * v.pacote.acompanhantes)}</b></div>` : ''}`
      : `<div class="sum-row"><span>${v.noites} noite${v.noites>1?'s':''}${new Set(v.diarias.map(x=>x.valor)).size > 1 ? ` <span class="hint">(valores variam)</span>` : ` x ${brl(v.diarias[0].valor)}`}</span><b class="mono">${brl(v.somaDiarias)}</b></div>`}
      ${v.limpeza ? `<div class="sum-row"><span>Taxa de limpeza</span><b class="mono">${brl(v.limpeza)}</b></div>` : ''}
      ${v.caucao ? `<div class="sum-row"><span>Caução <span class="hint">(devolvida após a saída)</span></span><b class="mono">${brl(v.caucao)}</b></div>` : ''}
      ${linhasTotal(v)}
    </div>` : `<p class="hint" style="margin-top:12px">Escolha as datas no calendário para ver o valor exato.</p>`}
    <button class="btn btn-sun btn-block" style="margin-top:14px" data-reservar ${ok?'':'disabled'}>Reservar</button>
    <p class="hint" style="margin-top:10px;text-align:center">Você ainda não paga nada nesta etapa.</p>
    ${U.contato ? `<button class="btn btn-ghost btn-block" style="margin-top:10px" data-falarprop>${I.wa} Falar com o proprietário</button>` : ''}`;
  $('#rcard').innerHTML = html;
  $('#barram').innerHTML = `<div><b>${v ? brl(v.total) : brl(U.diaria) + ' / noite'}</b><div class="hint">${v ? `${fmtCurto(sel.ci)} a ${fmtCurto(sel.co)} · ${sel.h} hósp.${v.restante > 0 ? ` · sinal ${brl(v.sinal)}` : ''}` : 'Escolha as datas'}</div></div>
    <button class="btn btn-sun" ${ok?'data-reservar':'data-ircal'}>${ok ? 'Reservar' : 'Ver datas'}</button>`;
  $('#selh').onchange = e => { sel.h = Number(e.target.value); cardReserva(); };
  $('#selcr') && ($('#selcr').onchange = e => { sel.cr = Number(e.target.value); cardReserva(); });
  $$('[data-ircal]').forEach(b => b.onclick = () => $('#blocoCal').scrollIntoView({ behavior:'smooth', block:'start' }));
  $$('[data-falarprop]').forEach(b => b.onclick = () => abrirWhats(U.contato, `Olá! Vi no site o anúncio do ${U.nome}${U.apelido ? ' (' + U.apelido + ')' : ''} na ${U.cond.nome}${sel.ci && sel.co ? `, para ${fmtD(sel.ci)} a ${fmtD(sel.co)} (${sel.h} pessoa${sel.h > 1 ? 's' : ''})` : ''}, e queria tirar uma dúvida.`));
  $$('[data-reservar]').forEach(b => b.onclick = () => { location.hash = `#/reservar/${U.slug}?ci=${sel.ci}&co=${sel.co}&h=${sel.h}${pk ? '&cr=' + sel.cr : ''}`; });
}
// total, sinal e restante (mesmo bloco no cartão, no formulário e na reserva)
function linhasTotal(v){
  if (!(v.restante > 0)) return `<div class="sum-row" style="font-size:16px"><b>Total no Pix</b><b class="mono">${brl(v.total)}</b></div>`;
  return `<div class="sum-row" style="font-size:16px"><b>Total</b><b class="mono">${brl(v.total)}</b></div>
    <div class="sum-row" style="color:var(--t-ok)"><span><b>Sinal de ${v.sinalPct}% no Pix</b> <span class="hint">(garante as datas)</span></span><b class="mono">${brl(v.sinal)}</b></div>
    <div class="sum-row"><span>Restante na chegada</span><b class="mono">${brl(v.restante)}</b></div>
    <p class="hint" style="margin-top:6px">O sinal é descontado do total e não é devolvido em caso de desistência.</p>`;
}

/* =========================================================
   FORMULÁRIO DA RESERVA
   ========================================================= */
let arquivos = [];   // documento de cada hóspede: { tipoDoc, frente, verso }
async function telaReservar(s, q, vr = versao){
  if (!U || U.slug !== s){ const d = await api('/api/publico?acao=unidade&u=' + encodeURIComponent(s)); guardarSite(d); U = { ...d.unidade, hoje:d.hoje, prazo:d.prazoPreHoras, comodNomes:d.comodidades, cond:d.cond }; }
  if (velha(vr)) return;
  const h = Math.min(Math.max(1, Number(q.h) || 1), U.capacidade);
  if (!q.ci || !q.co || q.co <= q.ci || !periodoPermitido(q.ci, q.co)){ location.hash = '#/unidade/' + s; return; }
  const pkF = pacotesAtivos(U).find(p => p.ini === q.ci && p.fim === q.co);
  const idMinF = pkF ? (Number(pkF.idadeMin) || 6) : 6;
  let v = calcularValores(U, q.ci, q.co, { pagantes: h - Math.min(Math.max(0, Number(q.cr) || 0), h - 1) });
  arquivos = Array.from({ length:h }, () => ({ tipoDoc:'RG', modo:'partes', frente:null, verso:null, inteiro:null }));
  const civis = ['solteiro(a)','casado(a)','divorciado(a)','viúvo(a)','união estável'];
  app.innerHTML = `${topo('#/unidade/' + s + `?ci=${q.ci}&co=${q.co}&h=${h}`)}
  <div class="wrap-wide">
    <h1 class="h-title">Dados da reserva</h1>
    <p class="h-sub">Esses dados vão para o contrato de locação por temporada. Os documentos ficam guardados com segurança e só o dono da unidade vê.</p>
    <div class="form-grid" style="margin-top:18px">
      <form id="freserva" novalidate>
        <div class="hosp">
          <h4>${I.user} Titular da reserva (hóspede 1)</h4>
          <div class="grid3 m1">
            <div class="field span2"><label>Nome completo *</label><input class="inp" name="nome" autocomplete="name" required></div>
            <div class="field"><label>Data de nascimento *</label><input class="inp" name="nascimento" type="date" required></div>
            <div class="field"><label>CPF *</label><input class="inp" name="cpf" inputmode="numeric" placeholder="000.000.000-00" required></div>
            <div class="field"><label>RG *</label><input class="inp" name="rg" required></div>
            <div class="field"><label>Nacionalidade *</label><input class="inp" name="nacionalidade" value="brasileira" required></div>
            <div class="field"><label>Estado civil *</label><select class="inp" name="estadoCivil" required><option value="">Escolha</option>${civis.map(c=>`<option>${c}</option>`).join('')}</select></div>
            <div class="field span2"><label>Profissão *</label><input class="inp" name="profissao" required></div>
            <div class="field span3"><label>Endereço completo (rua, número, bairro, cidade, UF, CEP) *</label><input class="inp" name="endereco" autocomplete="street-address" required></div>
            <div class="field"><label>E-mail *</label><input class="inp" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label>WhatsApp *</label><input class="inp" name="whats" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" required></div>
          </div>
          ${blocoDoc(0, 'Documento com foto do titular', true)}
        </div>
        ${Array.from({length:h-1},(_,i)=>`
        <div class="hosp" data-acomp="${i}">
          <h4>${I.user} Hóspede ${i+2}</h4>
          <div class="grid3 m1">
            <div class="field span2"><label>Nome completo *</label><input class="inp" name="a_nome_${i}" required></div>
            <div class="field"><label>Data de nascimento *</label><input class="inp" name="a_nasc_${i}" type="date" required></div>
            <div class="field span3"><label>Número do documento (opcional)</label><input class="inp" name="a_doc_${i}" placeholder="Ex.: 12.345.678-9"></div>
          </div>
          ${blocoDoc(i+1, 'Documento do hóspede ' + (i+2), false)}
        </div>`).join('')}
        <div class="hosp">
          <h4>${I.doc} Confirmação</h4>
          <label class="check"><input type="checkbox" name="aceite"> <span>Li e aceito as regras da casa, os requisitos e a política de cancelamento desta unidade, e autorizo o uso dos meus dados e documentos para a reserva e o contrato, conforme a LGPD.</span></label>
          <button class="btn btn-sun btn-block" style="margin-top:16px" id="btnEnviar">Fazer pré-reserva</button>
          <p class="hint" style="margin-top:10px;text-align:center">As datas ficam guardadas por ${U.prazo} horas enquanto você faz o Pix.</p>
        </div>
      </form>
      <aside class="resumo">
        <img src="${esc(U.fotos[0])}" alt="">
        <h3 style="font-size:17px;margin:12px 0 2px">${esc(U.titulo)}</h3>
        <p class="hint">${esc(U.nome)} · ${esc(U.cond.nome)}</p>
        <div class="divider"></div>
        <div class="sum-row"><span>${I.cal} ${fmtD(q.ci)} a ${fmtD(q.co)}</span></div>
        <div class="sum-row"><span>${I.users} ${h} hóspede${h>1?'s':''}</span></div>
        <div id="resvals">${resumoValores(v)}</div>
        ${pkF ? `<p class="hint" style="margin-top:8px">${emojiPacote(pkF.nome)} Pacote ${esc(pkF.nome)}: crianças de até ${idMinF - 1} anos na data de entrada não pagam. O valor acompanha as datas de nascimento.</p>` : ''}
      </aside>
    </div>
  </div>`;
  const f = $('#freserva');
  // no pacote o valor depende da idade de cada acompanhante na data de entrada
  const idadeEm = (nasc, ref) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc || '')) return 99; let i = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4)); if (ref.slice(5) < nasc.slice(5)) i--; return i; };
  const recalcular = () => {
    if (!pkF) return;
    const pag = 1 + Array.from({ length:h-1 }, (_, i) => f['a_nasc_' + i]?.value || '').filter(n => idadeEm(n, q.ci) >= idMinF).length;
    v = calcularValores(U, q.ci, q.co, { pagantes: pag });
    $('#resvals').innerHTML = resumoValores(v);
  };
  if (pkF) { $$('[name^="a_nasc_"]', f).forEach(i => i.addEventListener('change', recalcular)); }
  f.cpf.oninput = e => { e.target.value = mascaraCPF(e.target.value); };
  f.whats.oninput = e => { e.target.value = mascaraFone(e.target.value); };
  $$('[data-arq]').forEach(inp => inp.onchange = async () => {
    const [i, lado] = inp.dataset.arq.split('-'), file = inp.files[0]; if (!file) return;
    try { arquivos[+i][lado] = await prepararArquivo(file); atualizarSlot(+i); }
    catch(e){ toast(e.message); inp.value = ''; }
  });
  $$('[data-tipodoc]').forEach(sel => sel.onchange = () => { const i = Number(sel.dataset.tipodoc); arquivos[i].tipoDoc = sel.value; atualizarSlot(i); });
  $$('[data-modo]').forEach(sel => sel.onchange = () => { const i = Number(sel.dataset.modo); arquivos[i].modo = sel.value; atualizarSlot(i); });
  f.onsubmit = async e => {
    e.preventDefault();
    const g = (n) => (f[n]?.value || '').trim();
    const titular = { nome:g('nome'), nascimento:g('nascimento'), cpf:g('cpf'), rg:g('rg'), nacionalidade:g('nacionalidade'), estadoCivil:g('estadoCivil'), profissao:g('profissao'), endereco:g('endereco'), email:g('email'), whats:g('whats') };
    for (const [k, v2] of Object.entries(titular)) if (!v2) { f[k].focus(); return toast('Preencha todos os dados do titular.'); }
    if (idadeEm(titular.nascimento, U.hoje) < 18) { f.nascimento.focus(); return toast('O titular da reserva precisa ter 18 anos ou mais.'); }
    const acompanhantes = Array.from({length:h-1}, (_,i) => ({ nome:g('a_nome_'+i), nascimento:g('a_nasc_'+i), tipoDoc:arquivos[i+1].tipoDoc, numero:g('a_doc_'+i) }));
    for (let i = 0; i < acompanhantes.length; i++) if (!acompanhantes[i].nome || !acompanhantes[i].nascimento) { f['a_nome_'+i].focus(); return toast(`Preencha o nome e a data de nascimento do hóspede ${i+2}.`); }
    // só o documento do titular é obrigatório; o dos demais hóspedes é opcional
    const a0 = arquivos[0];
    if (a0.modo === 'inteiro'){
      if (!a0.inteiro) { $(`[data-slot="0-inteiro"]`).scrollIntoView({ behavior:'smooth', block:'center' }); return toast('Envie o documento completo do titular (hóspede 1).'); }
    } else {
      if (!a0.frente) { $(`[data-slot="0-frente"]`).scrollIntoView({ behavior:'smooth', block:'center' }); return toast('Envie a frente do documento do hóspede 1.'); }
      if (precisaVerso(a0.tipoDoc, a0.frente.tipo) && !a0.verso) { $(`[data-slot="0-verso"]`).scrollIntoView({ behavior:'smooth', block:'center' }); return toast('Envie o verso do documento do hóspede 1.'); }
    }
    if (!f.aceite.checked) return toast('Marque a confirmação para continuar.');
    const btn = $('#btnEnviar');
    await ocupado(btn, async () => {
      const r = await api('/api/publico', { corpo:{ acao:'reservar', u:s, ci:q.ci, co:q.co, hospedes:h, titular, acompanhantes, aceite:true } });
      try { localStorage.setItem('lsm_reserva_' + r.id, r.token); } catch(_){}
      const envios = [];
      arquivos.forEach((a, i) => {
        if (a.modo === 'inteiro') { if (a.inteiro) envios.push({ i, lado:'inteiro', a }); return; }
        for (const lado of ['frente', 'verso']) if (a[lado] && a.frente && (lado === 'frente' || precisaVerso(a.tipoDoc, a.frente.tipo))) envios.push({ i, lado, a });
      });
      const ov = modal(`<div class="okbig">📤</div><h3 style="text-align:center">Enviando documentos</h3><p class="hint" style="text-align:center" id="prog">0 de ${envios.length}</p>`);
      let falhas = 0;
      for (const [k, { i, lado, a }] of envios.entries()){
        try { await api('/api/publico', { corpo:{ acao:'doc', id:r.id, t:r.token, idx:i, lado, tipoDoc:a.tipoDoc, dados:a[lado].dados, tipo:a[lado].tipo, nome:a[lado].nome } }); }
        catch(e){ falhas++; }
        const p = $('#prog', ov); if (p) p.textContent = `${k+1} de ${envios.length}`;
      }
      fecharModal();
      if (falhas) toast(`${falhas} documento(s) não foram enviados. Envie de novo na página da reserva.`);
      location.hash = `#/reserva/${r.id}/${r.token}`;
    }).catch(e => { if (e.status === 409) setTimeout(() => location.hash = '#/unidade/' + s, 1500); });
  };
}
function resumoValores(v){
  return `${v.pacote ? `<div class="sum-row"><span>Pacote ${esc(v.pacote.nome)} (casal)</span><b class="mono">${brl(v.pacote.casal)}</b></div>
    ${v.pacote.acompanhantes ? `<div class="sum-row"><span>${v.pacote.acompanhantes} acompanhante${v.pacote.acompanhantes>1?'s':''} x ${brl(v.pacote.acompanhante)}</span><b class="mono">${brl(v.pacote.acompanhante * v.pacote.acompanhantes)}</b></div>` : ''}`
    : `<div class="sum-row"><span>${v.noites} noite${v.noites>1?'s':''}</span><b class="mono">${brl(v.somaDiarias)}</b></div>`}
    ${v.limpeza ? `<div class="sum-row"><span>Limpeza</span><b class="mono">${brl(v.limpeza)}</b></div>` : ''}
    ${v.caucao ? `<div class="sum-row"><span>Caução (devolvida)</span><b class="mono">${brl(v.caucao)}</b></div>` : ''}
    ${linhasTotal(v)}`;
}
// tipo do documento + frente e verso de um hóspede
// tipo do documento + frente e verso (ou o documento completo num arquivo só) de um hóspede
const NOME_LADO = { frente:'Frente', verso:'Verso', inteiro:'Documento completo' };
function blocoDoc(i, titulo, obrigatorio){
  return `<div class="field" style="margin-top:14px"><label>${esc(titulo)}${obrigatorio ? ' *' : ' (opcional)'}</label>
    <div class="grid2 m1"><div class="field"><label>Tipo de documento</label><select class="inp" data-tipodoc="${i}">${opcoesDoc('RG')}</select></div>
      <div class="field"><label>Como vai enviar</label><select class="inp" data-modo="${i}"><option value="partes">Frente e verso separados</option><option value="inteiro">Documento completo</option></select></div></div>
    <div class="hint" style="margin-top:6px" data-dica="${i}">${dicaDoc('RG', 'partes')}</div>
    <div class="grid2 m1" style="margin-top:10px" data-partes="${i}">${slotDoc(i, 'frente')}${slotDoc(i, 'verso')}</div>
    <div style="margin-top:10px;display:none" data-inteiro="${i}">${slotDoc(i, 'inteiro')}</div></div>`;
}
const dicaDoc = (tipo, modo) => modo === 'inteiro' ? 'Envie um arquivo só com o documento inteiro (frente e verso juntos), em foto ou PDF.'
  : ['RG','CNH','CPF','RNE/CRNM'].includes(tipo) ? 'Envie a frente e o verso (fotos) ou um PDF com os dois lados.' : 'Envie a foto ou o PDF do documento (o verso é opcional).';
function slotDoc(i, lado){
  return `<label class="slot" data-slot="${i}-${lado}" style="cursor:pointer"><span class="ic">🪪</span><span class="mid"><b>${NOME_LADO[lado]}</b><span>Foto ou PDF</span></span><span class="btn btn-ghost btn-sm">${I.up}</span><input type="file" accept="image/*,application/pdf" data-arq="${i}-${lado}" hidden></label>`;
}
function atualizarSlot(i){
  const a = arquivos[i];
  const dica = $(`[data-dica="${i}"]`); if (dica) dica.textContent = dicaDoc(a.tipoDoc, a.modo);
  const pt = $(`[data-partes="${i}"]`), it = $(`[data-inteiro="${i}"]`);
  if (pt) pt.style.display = a.modo === 'inteiro' ? 'none' : '';
  if (it) it.style.display = a.modo === 'inteiro' ? '' : 'none';
  for (const lado of ['frente', 'verso', 'inteiro']){
    const x = a[lado], el = $(`[data-slot="${i}-${lado}"]`); if (!el) continue;
    const precisa = lado !== 'verso' || !a.frente || precisaVerso(a.tipoDoc, a.frente.tipo);
    el.classList.toggle('ok', !!x);
    el.style.opacity = !x && !precisa ? '.55' : '';
    if (!x) { el.querySelector('.mid').innerHTML = `<b>${NOME_LADO[lado]}</b><span>${precisa ? 'Foto ou PDF' : 'Opcional (o PDF já tem tudo)'}</span>`; continue; }
    el.querySelector('.ic, .thumb').outerHTML = x.tipo === 'application/pdf' ? '<span class="ic">📄</span>' : `<img class="thumb" src="${x.dados}" alt="">`;
    el.querySelector('.mid').innerHTML = `<b>✓ ${NOME_LADO[lado]}</b><span>${esc(x.nome)} · toque para trocar</span>`;
  }
}

/* =========================================================
   ACOMPANHAMENTO DA RESERVA
   ========================================================= */
let tRelogio = null;
async function telaReserva(id, t, vr = versao){
  clearInterval(tRelogio);
  const d = await api(`/api/publico?acao=reserva&id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`);
  if (velha(vr)) return;
  const r = d.reserva, st = r.status, v = r.valores, c = r.contrato;
  const ordem = ['pre','pago_informado','confirmada','assinatura','assinado'];
  const idx = ordem.indexOf(st);
  const passo = (n, titulo, conteudo, feito, atual) => `<div class="sv ${feito?'feito':atual?'atual':''}"><div class="n">${feito?'✓':n}</div><div class="c"><b>${titulo}</b>${conteudo||''}</div></div>`;
  const sinal = v.sinal ?? v.total, rest = r.restante || { valor:0 }, temRest = rest.valor > 0;
  const pixCod = r.pix ? codigoPix(r.pix, sinal, r.txid) : '';
  const pixRestCod = r.pixRestante ? codigoPix(r.pixRestante, rest.valor, String(r.txid || r.id).slice(0, 23) + 'R') : '';
  const restFeito = !!rest.recebidoEm;
  let corpoRest = '';
  if (temRest){
    if (rest.recebidoEm) corpoRest = `<p>✅ Restante de ${brl(rest.valor)} recebido em ${fmtDH(rest.recebidoEm)}.</p>`;
    else if (rest.informadoEm) corpoRest = `<p>Você informou o Pix do restante (${brl(rest.valor)}) em ${fmtDH(rest.informadoEm)}. O dono vai conferir.</p>`;
    else if (pixRestCod) corpoRest = `<p>Pague o restante de <b>${brl(rest.valor)}</b> no dia da entrada (${fmtD(r.ci)}), por Pix para <b>${esc(r.pixRestante.nome)}</b>.</p>
      <details style="margin-top:8px"><summary class="btn btn-ghost btn-sm" style="list-style:none">Ver o QR Code do restante</summary><div class="qr-box" style="margin:12px 0 8px">${qrSvg(pixRestCod)}</div><div class="code">${esc(pixRestCod)}</div></details>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-sea btn-sm" data-copiarrest>${I.copy} Copiar Pix do restante</button><button class="btn btn-sun btn-sm" data-pagueirest>${I.check} Já paguei o restante</button></div>`;
    else corpoRest = `<p>O restante de ${brl(rest.valor)} é pago no dia da entrada (${fmtD(r.ci)}). O Pix aparece aqui depois que o dono confirmar a reserva.</p>`;
  }
  const linkAqui = location.href;
  let corpoPix = '';
  if (st === 'pre') corpoPix = `<p>Pague ${temRest ? `o sinal de <b>${brl(sinal)}</b> (${v.sinalPct}%)` : brl(v.total)} por Pix para <b>${esc(r.pix.nome)}</b>. As datas ficam guardadas até <b>${fmtDH(r.expiraEm)}</b> <span class="hint" id="relogio"></span>.</p>
      <div class="qr-box" style="margin:14px 0 10px">${qrSvg(pixCod)}</div>
      <div class="code" id="pixcod">${esc(pixCod)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-sea" data-copiar>${I.copy} Copiar código Pix</button><button class="btn btn-sun" data-paguei>${I.check} Já paguei</button></div>`;
  else if (st === 'pago_informado') corpoPix = `<p>Você informou o pagamento em ${fmtDH(r.pagoInformadoEm) || 'agora'}. O dono vai conferir no banco e confirmar.</p>
      ${!d.papi && r.whatsDono ? `<button class="btn btn-wa btn-sm" style="margin-top:10px" data-avisardono>${I.wa} Avisar o dono no WhatsApp</button>` : ''}
      <details style="margin-top:10px"><summary class="hint" style="cursor:pointer">Ver o Pix de novo</summary><div class="code" style="margin-top:8px">${esc(pixCod)}</div></details>`;
  let corpoContrato = '';
  if (c){
    corpoContrato += `<p>${c.pdf ? `<a class="btn btn-ghost btn-sm" style="margin-top:8px" href="${c.pdf}" target="_blank" rel="noopener">${I.doc} Ler o contrato (PDF)</a>` : ''}</p>`;
    if (st === 'assinado'){
      corpoContrato += `<p>Contrato assinado pelas duas partes. ${c.final ? `<a class="btn btn-ok btn-sm" href="${c.final}&baixar=1" target="_blank" rel="noopener">${I.doc} Baixar contrato assinado</a>` : ''}</p>`;
    } else if (c.metodo === 'aceite'){
      const ac = c.aceite || {};
      corpoContrato += ac.locatario ? `<p>✅ Você aceitou o contrato em ${fmtDH(ac.locatario)}.${ac.locador ? '' : ' Falta o aceite do proprietário.'}</p>`
        : `<p>Leia o contrato (botão acima). Para aceitar, enviamos um código de 6 números para o seu WhatsApp${ac.final ? ` (final ${esc(ac.final)})` : ''}.</p>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="liaceito"> <span>Li o contrato e concordo com todas as cláusulas.</span></label>
        <button class="btn btn-sun btn-sm" style="margin-top:10px" data-pedircodigo>${I.wa} Receber código no WhatsApp</button>
        <div id="boxcodigo" style="display:none;margin-top:12px"><div class="field"><label>Código recebido no WhatsApp</label><input class="inp" id="codaceite" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></div>
        <button class="btn btn-ok btn-sm" style="margin-top:8px" data-confirmaraceite>${I.check} Confirmar aceite do contrato</button></div>`;
    } else if (c.metodo === 'autentique' && c.linkAssinatura){
      corpoContrato += c.assinouInquilino ? `<p>✅ Você já assinou. Falta a assinatura do dono.</p>` : `<p>Toque no botão para ler e assinar pelo celular (Autentique).</p><a class="btn btn-sun" style="margin-top:8px" href="${esc(c.linkAssinatura)}" target="_blank" rel="noopener">${I.pen} Assinar contrato</a>${c.teste ? '<p class="hint">Modo de teste da assinatura.</p>' : ''}`;
    } else {
      corpoContrato += c.inquilinoEnviou ? `<p>✅ Recebemos o contrato assinado por você. Agora o dono assina e envia a versão final.</p>`
        : `<p>Assine pelo gov.br (grátis):</p>
        <ol class="hint" style="margin:6px 0 10px 18px;line-height:1.6"><li>Baixe o contrato em PDF (botão acima).</li><li>Abra o Assinador gov.br em <b>assinador.iti.br</b> e entre com a sua conta gov.br (nível prata ou ouro).</li><li>Escolha o PDF, posicione a assinatura e baixe o arquivo assinado.</li><li>Volte aqui e envie o PDF assinado.</li></ol>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="${GOVBR_ASSINADOR}" target="_blank" rel="noopener">Abrir assinador gov.br</a><label class="btn btn-sun btn-sm">${I.up} Enviar PDF assinado<input type="file" accept="application/pdf" id="upgov" hidden></label></div>`;
    }
  }
  const docsFalta = r.docs[0]?.completo ? [] : [0];   // só o documento do titular é obrigatório
  const podeDocs = !['cancelada','expirada','assinado'].includes(st);
  const podeVistoria = !['cancelada','expirada'].includes(st);
  const pessoas = [r.titular.nome, ...r.acompanhantes.map(a => a.nome)];
  app.innerHTML = `${topo('#/')}
  <div class="wrap">
    <p class="hint">Reserva</p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h1 class="h-title">${esc(r.id)}</h1><span class="chip st-${st}"><i></i>${esc(r.nomeStatus)}</span></div>
    <div class="panel" style="margin-top:14px;display:flex;gap:12px;align-items:center">
      ${r.unidade.foto ? `<img src="${esc(r.unidade.foto)}" alt="" style="width:76px;height:76px;border-radius:14px;object-fit:cover">` : ''}
      <div><b>${esc(r.unidade.titulo)}</b><div class="hint">${esc(r.unidade.nome)} · ${esc(r.cond.nome)}</div><div class="hint">${fmtD(r.ci)} (${esc(r.checkin)}) a ${fmtD(r.co)} (${esc(r.checkout)}) · ${r.hospedes} hóspede${r.hospedes>1?'s':''}</div></div>
    </div>
    ${['cancelada','expirada'].includes(st) ? `<div class="alert bad"><div class="ic">✖️</div><div><b>${st==='expirada'?'O prazo para pagar acabou e as datas foram liberadas.':'Esta reserva foi cancelada.'}</b><br><span class="hint">Se quiser, faça uma nova reserva.</span></div></div>
      <a class="btn btn-sun btn-block" style="margin-top:12px" href="#/unidade/${r.unidade.slug}">Ver datas de novo</a>` : `
    <div class="steps-v" style="margin-top:20px">
      ${passo(1, 'Pré-reserva feita', `<p>${fmtDH(r.criadoEm)}</p>`, true)}
      ${passo(2, 'Pagamento por Pix', corpoPix, idx >= 2, idx <= 1)}
      ${passo(3, 'Confirmação do dono', idx >= 2 ? '<p>Pagamento conferido. Reserva confirmada! 🎉</p>' : '<p>Depois do Pix, o dono confere e confirma.</p>', idx >= 2, false)}
      ${passo(4, 'Contrato de locação', c ? corpoContrato : '<p>O contrato fica pronto assim que a reserva for confirmada.</p>', st === 'assinado', idx >= 2 && st !== 'assinado')}
      ${temRest ? passo(5, 'Restante na chegada', corpoRest, restFeito, idx >= 2 && !restFeito) : ''}
      ${passo(temRest ? 6 : 5, 'Tudo pronto para a praia', st === 'assinado' ? `<p>Entrada em ${fmtD(r.ci)} a partir das ${esc(r.checkin)}. Boa viagem! 🌊</p>` : '<p>Com o contrato assinado, é só aproveitar.</p>', st === 'assinado' && (!temRest || restFeito), false)}
    </div>`}
    <div class="section-t"><h3>Valores</h3></div>
    <div class="panel">
      ${resumoValores({ ...v, sinal, restante: temRest ? rest.valor : 0, sinalPct: v.sinalPct || 100 })}
    </div>
    <div class="section-t"><h3>Documentos dos hóspedes</h3><span>${r.docs.filter(x => x?.completo).length} de ${r.hospedes} completos</span></div>
    <div class="list">${pessoas.map((nome, i) => { const dc = r.docs[i]; const tipo = dc?.tipoDoc && TIPOS_DOC.includes(dc.tipoDoc) ? dc.tipoDoc : 'RG'; return `
      <div class="panel ${dc?.completo ? '' : ''}" style="${dc?.completo ? 'border-color:rgba(53,208,143,.45)' : ''}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b>${dc?.completo ? '✅' : '🪪'} ${esc(nome)}</b>
          ${podeDocs ? `<select class="inp" style="width:auto;min-height:36px;padding:4px 10px" data-tipo-res="${i}">${opcoesDoc(tipo)}</select>` : `<span class="pill">${esc(dc?.tipoDoc || '')}</span>`}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${dc?.inteiro ? '<span class="chip st-pago"><i></i>Documento completo: recebido</span>'
            : !dc?.frente && i > 0 ? '<span class="chip st-futuro"><i></i>Documento opcional</span>'
            : ['frente','verso'].map(lado => { const tem = dc?.[lado]; const opc = lado === 'verso' && dc?.frente && !dc.precisaVerso; return `<span class="chip ${tem ? 'st-pago' : (opc ? 'st-futuro' : 'st-pre')}"><i></i>${lado === 'frente' ? 'Frente' : 'Verso'}: ${tem ? 'recebido' : (opc ? 'opcional' : 'falta')}</span>`; }).join('')}
          ${podeDocs ? [['frente','frente'],['verso','verso'],['inteiro','documento completo']].map(([lado, nome]) => `<label class="btn btn-ghost btn-sm">${I.up} ${dc?.[lado] ? 'Trocar' : 'Enviar'} ${nome}<input type="file" accept="image/*,application/pdf" data-doc="${i}" data-lado="${lado}" hidden></label>`).join('') : ''}
        </div></div>`; }).join('')}
    </div>
    ${docsFalta.length && !['cancelada','expirada'].includes(st) ? `<div class="alert warn"><div class="ic">🪪</div><div>Falta o documento do titular (frente e verso, ou o documento completo). O dono precisa dele para confirmar. O documento dos outros hóspedes é opcional.</div></div>` : ''}
    <div class="section-t"><h3>${I.cam} Fotos do imóvel (vistoria)</h3><span>${(r.vistoria||[]).length} foto${(r.vistoria||[]).length===1?'':'s'}</span></div>
    <div class="panel" id="vistoria"><p class="hint">Ao chegar, tire fotos de como encontrou a unidade (cômodos, móveis, eletrodomésticos e qualquer defeito). Na saída, faça o mesmo. Isso protege você e o dono na devolução da caução.</p>${vistoriaHtml(r.vistoria || [], 'hospede', podeVistoria)}</div>
    <div class="divider" style="margin-top:22px"></div>
    <p class="hint">Guarde o link desta página para acompanhar a reserva.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-ghost btn-sm" data-copiarlink>${I.copy} Copiar link da reserva</button>
      ${r.whatsDono ? `<button class="btn btn-ghost btn-sm" data-faladono>${I.wa} Falar com o dono</button>` : ''}
      ${st === 'pre' ? `<button class="btn btn-bad btn-sm" data-cancelar>Cancelar pré-reserva</button>` : ''}
    </div>
  </div>`;
  const recarregar = () => telaReserva(id, t);
  $('[data-copiar]') && ($('[data-copiar]').onclick = () => copiar(pixCod, 'Código Pix copiado'));
  $('[data-copiarlink]').onclick = () => copiar(linkAqui, 'Link da reserva copiado');
  $('[data-faladono]') && ($('[data-faladono]').onclick = () => abrirWhats(r.whatsDono, `Olá! Sou ${r.titular.nome}, da reserva ${r.id} (${r.unidade.nome}, ${fmtD(r.ci)} a ${fmtD(r.co)}). `));
  $('[data-pedircodigo]') && ($('[data-pedircodigo]').onclick = (e) => {
    if (!$('#liaceito').checked) return toast('Marque que leu e concorda com o contrato.');
    ocupado(e.currentTarget, async () => {
      const x = await api('/api/publico', { corpo:{ acao:'aceiteCodigo', id, t } });
      if (x.ja) return recarregar();
      $('#boxcodigo').style.display = ''; $('#codaceite').focus();
      toast(`Código enviado para o WhatsApp final ${x.final}`);
    });
  });
  $('[data-confirmaraceite]') && ($('[data-confirmaraceite]').onclick = (e) => {
    const codigo = $('#codaceite').value.replace(/\D/g, '');
    if (codigo.length !== 6) return toast('Digite os 6 números do código.');
    ocupado(e.currentTarget, async () => {
      const x = await api('/api/publico', { corpo:{ acao:'aceiteConfirmar', id, t, codigo } });
      toast(x.assinado ? '🎉 Contrato assinado pelas duas partes' : '✅ Aceite registrado');
      await recarregar();
    });
  });
  $('[data-copiarrest]') && ($('[data-copiarrest]').onclick = () => copiar(pixRestCod, 'Pix do restante copiado'));
  $('[data-pagueirest]') && ($('[data-pagueirest]').onclick = (e) => ocupado(e.currentTarget, async () => {
    const x = await api('/api/publico', { corpo:{ acao:'pagueiRestante', id, t } });
    await recarregar();
    if (!x.avisado && x.fone) modal(`<div class="okbig">⏳</div><h3 style="text-align:center">Restante informado!</h3><p class="hint" style="text-align:center">Mande um aviso para o dono conferir.</p><button class="btn btn-wa btn-block" style="margin-top:16px" data-av>${I.wa} Avisar o dono no WhatsApp</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Fechar</button>`,
      ov => { $('[data-av]', ov).onclick = () => { abrirWhats(x.fone, x.mensagem); fecharModal(); }; });
    else toast('✅ Pagamento do restante informado');
  }));
  $('[data-avisardono]') && ($('[data-avisardono]').onclick = () => abrirWhats(r.whatsDono, `💰 Olá! Fiz o Pix de ${brl(sinal)} da reserva ${r.id} (${r.unidade.nome}, ${fmtD(r.ci)} a ${fmtD(r.co)}).\n\nNome: ${r.titular.nome}`));
  $('[data-paguei]') && ($('[data-paguei]').onclick = (e) => ocupado(e.currentTarget, async () => {
    const x = await api('/api/publico', { corpo:{ acao:'paguei', id, t } });
    await recarregar();
    if (!x.avisado && x.fone) modal(`<div class="okbig">⏳</div><h3 style="text-align:center">Pagamento informado!</h3><p class="hint" style="text-align:center">Mande um aviso para o dono conferir mais rápido.</p><button class="btn btn-wa btn-block" style="margin-top:16px" data-av>${I.wa} Avisar o dono no WhatsApp</button><button class="btn btn-ghost btn-block" style="margin-top:8px" data-fechar>Fechar</button>`,
      ov => { $('[data-av]', ov).onclick = () => { abrirWhats(x.fone, x.mensagem); fecharModal(); }; });
    else toast('✅ Pagamento informado ao dono');
  }));
  $('[data-cancelar]') && ($('[data-cancelar]').onclick = (e) => { if (confirm('Cancelar a pré-reserva e liberar as datas?')) ocupado(e.currentTarget, async () => { await api('/api/publico', { corpo:{ acao:'cancelar', id, t } }); toast('Pré-reserva cancelada'); recarregar(); }); });
  $$('[data-doc]').forEach(inp => inp.onchange = async () => {
    const i = Number(inp.dataset.doc), lado = inp.dataset.lado, file = inp.files[0]; if (!file) return;
    const tipoDoc = $(`[data-tipo-res="${i}"]`)?.value || 'RG';
    try {
      const a = await prepararArquivo(file);
      toast('Enviando...');
      await api('/api/publico', { corpo:{ acao:'doc', id, t, idx:i, lado, tipoDoc, dados:a.dados, tipo:a.tipo, nome:a.nome } });
      toast('✅ Documento enviado'); recarregar();
    } catch(e){ toast(e.message); }
  });
  prepararVistoria($('#vistoria'), (c2) => api('/api/publico', { corpo:{ acao:'vistoria', id, t, ...c2 } }), (idx) => api('/api/publico', { corpo:{ acao:'removerVistoria', id, t, idx } }), recarregar);
  const up = $('#upgov');
  up && (up.onchange = async () => {
    const file = up.files[0]; if (!file) return;
    if (file.type !== 'application/pdf') return toast('Envie o PDF assinado.');
    try { const a = await prepararArquivo(file, { maxMB:4 }); toast('Enviando...'); await api('/api/publico', { corpo:{ acao:'govbr', id, t, dados:a.dados } }); toast('✅ Contrato assinado enviado'); recarregar(); }
    catch(e){ toast(e.message); }
  });
  if (st === 'pre' && r.expiraEm){
    const rel = () => { const ms = Date.parse(r.expiraEm) - Date.now(); const el = $('#relogio'); if (!el) return clearInterval(tRelogio); if (ms <= 0){ clearInterval(tRelogio); recarregar(); return; } const hh = Math.floor(ms/3600e3), mm = Math.floor(ms%3600e3/60e3); el.textContent = `(faltam ${hh}h${pad(mm)})`; };
    rel(); tRelogio = setInterval(rel, 30000);
  }
}

render();
