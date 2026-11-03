/* Lua Sol e Mar - funções compartilhadas pelo site e pelo app */
'use strict';

/* ---------------- tema claro / escuro ---------------- */
(function iniciarTema(){
  let t = null; try { t = localStorage.getItem('lsm_tema'); } catch(e){}
  if (t !== 'claro' && t !== 'escuro') t = matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro';
  document.documentElement.dataset.tema = t;
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = t === 'claro' ? '#f5f1ea' : '#071423';
})();
function trocarTema(){
  const t = document.documentElement.dataset.tema === 'claro' ? 'escuro' : 'claro';
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem('lsm_tema', t); } catch(e){}
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = t === 'claro' ? '#f5f1ea' : '#071423';
}
document.addEventListener('click', e => { if (e.target.closest('[data-tema-btn]')) trocarTema(); });
const botaoTema = () => `<button class="icon-btn" data-tema-btn aria-label="Trocar tema claro ou escuro" title="Tema claro / escuro"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>`;

/* ---------------- utilidades ---------------- */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const pad = (n, l=2) => String(n).padStart(l, '0');
const brl = (v) => (Number(v)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digitos = (t) => String(t||'').replace(/\D/g,'');
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS_S = ['D','S','T','Q','Q','S','S'];
function hojeLocal(){ const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
const utc = (iso) => { const [y,m,d] = iso.split('-').map(Number); return Date.UTC(y, m-1, d); };
const dias = (de, ate) => Math.round((utc(ate) - utc(de)) / 864e5);
const fmtD = (iso) => { if (!iso) return ''; const [y,m,d] = String(iso).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
const fmtCurto = (iso) => { const [,m,d] = iso.split('-'); return `${+d} ${MESES[+m-1]}`; };
const mesAno = (iso) => { const [y,m] = iso.split('-'); return `${MESES[+m-1]}/${y}`; };
const fmtDH = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
function addMes(ym, n, dia){
  let [y, m] = ym.split('-').map(Number); m = m - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  const ult = new Date(Date.UTC(y, m+1, 0)).getUTCDate();
  return `${y}-${pad(m+1)}-${pad(Math.min(dia, ult))}`;
}
function somaDias(iso, n){ const [y,m,d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m-1, d+n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())}`; }
function noitesEntre(ci, co){ const out = []; for (let d = ci; d < co && out.length < 400; d = somaDias(d, 1)) out.push(d); return out; }
const num = (v) => { v = String(v ?? '').trim(); if (v.includes(',')) v = v.replace(/\./g,'').replace(',','.'); return Number(v); };
const mascaraCPF = (v) => digitos(v).slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
const mascaraFone = (v) => { const d = digitos(v).slice(0,11); return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,''); };

/* ---------------- preços (mesma regra do servidor) ---------------- */
function precoNoite(a, d){
  const esp = (a.especiais || []).find(e => e.ini <= d && d <= e.fim && Number(e.diaria) > 0);
  if (esp) return Number(esp.diaria);
  const ds = new Date(d + 'T12:00:00Z').getUTCDay();
  if ((ds === 5 || ds === 6) && Number(a.diariaFds) > 0) return Number(a.diariaFds);
  return Number(a.diaria) || 0;
}
// pacotes fechados (Natal, Réveillon...): só reserva o período inteiro
const pacotesAtivos = (a) => (a.pacotes || []).filter(p => p.ativo !== false && p.ini && p.fim && p.fim > p.ini);
const pacoteDaNoite = (a, d) => pacotesAtivos(a).find(p => p.ini <= d && d < p.fim);
const pacotesNoPeriodo = (a, ci, co) => pacotesAtivos(a).filter(p => noitesEntre(ci, co).some(d => p.ini <= d && d < p.fim));
const r2 = (v) => Math.round(v * 100) / 100;
// mesma conta do servidor; pagantes = pessoas a partir da idade mínima do pacote
function calcularValores(a, ci, co, { pagantes } = {}){
  const pk = pacotesAtivos(a).find(p => p.ini === ci && p.fim === co);
  const limpeza = pk && pk.limpeza !== undefined && pk.limpeza !== null && pk.limpeza !== '' ? Number(pk.limpeza)||0 : Number(a.limpeza)||0;
  const caucao = Number(a.caucao)||0;
  let base;
  if (pk){
    const nAc = Math.max(0, Math.max(1, Number(pagantes) || 2) - 2);
    base = { pacote:{ id:pk.id, nome:pk.nome, casal:Number(pk.casal)||0, acompanhante:Number(pk.acompanhante)||0, acompanhantes:nAc, idadeMin:Number(pk.idadeMin)||6, checkin:pk.checkin, checkout:pk.checkout },
      diarias:[], noites: noitesEntre(ci, co).length, somaDiarias: r2((Number(pk.casal)||0) + (Number(pk.acompanhante)||0) * nAc) };
  } else {
    const diarias = noitesEntre(ci, co).map(d => ({ data:d, valor: precoNoite(a, d) }));
    base = { diarias, noites: diarias.length, somaDiarias: r2(diarias.reduce((s,x)=>s+x.valor,0)) };
  }
  const total = r2(base.somaDiarias + limpeza + caucao);
  const sinalPct = Math.min(100, Math.max(1, Number(a.sinalPct) || 100));
  const sinal = sinalPct >= 100 ? total : r2(total * sinalPct / 100);
  return { ...base, limpeza, caucao, total, sinalPct, sinal, restante: r2(total - sinal) };
}

/* ---------------- servidor ---------------- */
async function api(caminho, { corpo, token, metodo } = {}){
  const r = await fetch(caminho, {
    method: metodo || (corpo ? 'POST' : 'GET'),
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer ' + token } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).catch(() => null);
  if (!r) { const e = new Error('Sem conexão. Confira a internet e tente de novo.'); e.status = 0; throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.erro || 'Algo deu errado. Tente de novo.'); e.status = r.status; throw e; }
  return j;
}

/* ---------------- avisos e janelas ---------------- */
function toast(msg, acao){
  let box = $('#toasts'); if (!box){ box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role','status');
  el.innerHTML = `<span>${esc(msg)}</span>` + (acao ? `<button>${esc(acao.txt)}</button>` : '');
  if (acao) el.querySelector('button').onclick = () => { acao.fn(); el.remove(); };
  box.appendChild(el);
  setTimeout(() => el.remove(), acao ? 8000 : 3600);
}
function modal(html, onMount, { larga = false } = {}){
  fecharModal();
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'ov';
  ov.innerHTML = `<div class="sheet ${larga?'larga':''}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-fechar]')) fecharModal(); });
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  onMount && onMount(ov);
  return ov;
}
function fecharModal(){ $('#ov')?.remove(); document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });
// erro já mostrado na tela (toast) não precisa virar erro no console
window.addEventListener('unhandledrejection', e => { if (e.reason && e.reason.mostrado) e.preventDefault(); });
async function copiar(t, msg = 'Copiado'){
  try { await navigator.clipboard.writeText(t); }
  catch(e){ const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast(msg);
}
async function ocupado(btn, fn){
  const html = btn ? btn.innerHTML : '';
  if (btn){ btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  try { return await fn(); }
  catch(e){ toast(e.message); e.mostrado = true; throw e; }
  finally { if (btn && btn.isConnected){ btn.disabled = false; btn.innerHTML = html; } }
}

/* ---------------- WhatsApp ---------------- */
function jid(fone){ let j = digitos(fone); if (j && j.length <= 11) j = '55' + j; return j; }
function abrirWhats(fone, texto){
  const j = jid(fone);
  const url = (j ? `https://wa.me/${j}` : 'https://wa.me/') + '?text=' + encodeURIComponent(texto);
  const w = window.open(url, '_blank'); if (!w) location.href = url;
}

/* ---------------- Pix ---------------- */
function crc16(t){ let c = 0xFFFF; for (let i = 0; i < t.length; i++){ c ^= t.charCodeAt(i) << 8; for (let b = 0; b < 8; b++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4,'0'); }
const _campo = (id, v) => { v = String(v); return id + String(v.length).padStart(2,'0') + v; };
const _limpa = (t, max) => String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 ]/g,'').toUpperCase().trim().slice(0, max);
function codigoPix(pix, valor, txid){
  const tx = String(txid || '***').replace(/[^A-Za-z0-9]/g,'').slice(0,25) || '***';
  let c = _campo('00','01') + _campo('26', _campo('00','BR.GOV.BCB.PIX') + _campo('01', String(pix.chave).trim())) + _campo('52','0000') + _campo('53','986');
  if (valor > 0) c += _campo('54', Number(valor).toFixed(2));
  c += _campo('58','BR') + _campo('59', _limpa(pix.nome, 25) || 'RECEBEDOR') + _campo('60', _limpa(pix.cidade, 15) || 'SAO PAULO') + _campo('62', _campo('05', tx)) + '6304';
  return c + crc16(c);
}
function qrSvg(texto){
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  const n = q.getModuleCount(), m = 2; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c+m} ${r+m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n+2*m} ${n+2*m}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#071423"/></svg>`;
}
function lerPixCola(t){
  t = String(t||'').trim(); if (!t.startsWith('000201')) return null;
  const tlv = (s) => { const o = {}; let i = 0; while (i + 4 <= s.length){ const id = s.slice(i,i+2), n = +s.slice(i+2,i+4); o[id] = s.slice(i+4,i+4+n); i += 4 + n; } return o; };
  const r = tlv(t), m = tlv(r['26'] || '');
  return m['01'] ? { chave:m['01'], nome:r['59']||'', cidade:r['60']||'' } : null;
}

/* ---------------- arquivos (foto reduzida ou PDF) ---------------- */
async function prepararArquivo(file, { maxLado = 1800, qualidade = .8, maxMB = 3 } = {}){
  if (!file) throw new Error('Escolha um arquivo.');
  if (file.type === 'application/pdf'){
    if (file.size > maxMB * 1024 * 1024) throw new Error(`PDF muito grande (máximo ${maxMB} MB). Tente tirar uma foto do documento.`);
    const dados = await new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = err; fr.readAsDataURL(file); });
    return { dados, tipo:'application/pdf', nome:file.name };
  }
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|heic|webp)$/i.test(file.name)) throw new Error('Envie uma foto ou um PDF.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('Não consegui abrir esta imagem. Tente outra foto ou um PDF.')); i.src = url; });
    const f = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dados: c.toDataURL('image/jpeg', qualidade), tipo:'image/jpeg', nome: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg' };
  } finally { URL.revokeObjectURL(url); }
}

/* ---------------- ícones ---------------- */
const I = {
  logo:`<svg width="26" height="26" viewBox="0 0 32 32"><circle cx="20" cy="12" r="6.5" fill="#f6b544"/><path d="M15.5 4.5a7.5 7.5 0 1 0 8.6 9.9 6 6 0 0 1-8.6-9.9Z" fill="#9fb3f0"/><path d="M3 22c3 0 3-2 6.5-2S13 22 16 22s3-2 6.5-2S26 22 29 22v6H3Z" fill="#2ec4c6"/><path d="M3 25c3 0 3-1.5 6.5-1.5S13 25 16 25s3-1.5 6.5-1.5S26 25 29 25" stroke="#7fe3e0" stroke-width="1.4" fill="none"/></svg>`,
  back:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  pix:'<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12.9 2.6a1.3 1.3 0 0 0-1.8 0L7.3 6.4h.6c.9 0 1.7.3 2.3 1l1.8 1.8 1.8-1.8c.6-.6 1.4-1 2.3-1h.6zM16.1 17.6c-.9 0-1.7-.3-2.3-1L12 14.8l-1.8 1.8c-.6.6-1.4 1-2.3 1h-.6l3.8 3.8c.5.5 1.3.5 1.8 0l3.8-3.8zM21.4 11.1l-2.3-2.3c0 .1-.1.1-.2.1h-2.8c-.5 0-.9.2-1.3.5L13 11.2c-.3.3-.6.4-1 .4s-.7-.1-1-.4L9.2 9.4c-.4-.3-.8-.5-1.3-.5H5.6c-.1 0-.2 0-.2-.1L2.6 11.1a1.3 1.3 0 0 0 0 1.8l2.3 2.3c.1 0 .1-.1.2-.1h2.4c.5 0 .9-.2 1.3-.5l1.8-1.8c.6-.6 1.6-.6 2.1 0l1.8 1.8c.4.3.8.5 1.3.5H18c.1 0 .2 0 .2.1l2.3-2.3c.5-.5.5-1.3 0-1.8z"/></svg>',
  wa:'<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.7 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.7-.1 1.4Z"/></svg>',
  home:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  check:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  grid:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  bell:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  money:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/></svg>',
  gear:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  out:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  pin:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  lock:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  copy:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  cal:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  user:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  users:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
  bed:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18V6M21 18v-5a3 3 0 0 0-3-3H10v8"/><path d="M3 14h18"/><circle cx="6.5" cy="10.5" r="1.5"/></svg>',
  bath:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M6 12V5a2 2 0 0 1 4 0"/></svg>',
  door:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="15" cy="12" r="1"/></svg>',
  doc:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  up:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>',
  tool:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L21 12l-9 9-3-3 9-9-1.6-1.6a4 4 0 0 0-4.9-4.9Z"/><path d="M3 21l5-5"/></svg>',
  mais:'<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  cam:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/></svg>',
  beach:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20c2 0 2-1.5 4.5-1.5S10 20 12 20s2.5-1.5 4.5-1.5S19 20 21 20"/><path d="M12 18 8.5 6"/><path d="M3.5 8.5a8 8 0 0 1 14-3.5Z"/></svg>',
  pen:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c4-1 6-3 8-6"/><path d="m14 4 6 6-9 9H5v-6Z"/></svg>',
};
const ICONE_COMOD = { pe:'🏖️', vista:'🌊', wifi:'📶', ar:'❄️', ventilador:'🌀', cozinha:'🍳', tv:'📺', roupa:'🛏️', garagem:'🚗', churrasqueira:'🔥', piscina:'🏊', maquina:'🧺', varanda:'🌅', pet:'🐾' };

/* ---------------- calendário ---------------- */
class Calendario {
  constructor(el, op){ this.el = el; this.op = op; this.inicio = op.inicio || (op.ci || op.hoje).slice(0,7); this.render(); }
  set(op){ Object.assign(this.op, op); this.render(); }
  ocupada(d){ return this.op.ocupadas?.has(d); }
  livreEntre(ci, co){ return noitesEntre(ci, co).every(d => !this.ocupada(d)); }
  clique(d){
    const o = this.op;
    if (o.modo === 'dono'){ o.onDia && o.onDia(d); return; }
    const pacs = o.pacotes || [];
    const pkPeriodo = (ci, co) => pacs.find(p => noitesEntre(ci, co).some(n => p.ini <= n && n < p.fim));
    const escolhendoSaida = o.ci && !o.co && d > o.ci;
    const pk = pacs.find(p => p.ini <= d && d < p.fim);
    // tocar num dia de pacote seleciona o pacote inteiro (menos quando é a saída de uma estadia anterior a ele)
    if (pk && !(escolhendoSaida && !pkPeriodo(o.ci, d))){
      if (!this.livreEntre(pk.ini, pk.fim)){ o.onErro && o.onErro(`O pacote ${pk.nome} já está reservado.`); return; }
      o.ci = pk.ini; o.co = pk.fim;
      this.render(); o.onChange && o.onChange({ ci:o.ci, co:o.co, pacote:pk }); return;
    }
    if (escolhendoSaida && pkPeriodo(o.ci, d)){ const p = pkPeriodo(o.ci, d); o.onErro && o.onErro(`De ${fmtD(p.ini)} a ${fmtD(p.fim)} só é possível reservar o pacote ${p.nome} completo.`); return; }
    if (!o.ci || (o.ci && o.co)){ if (this.ocupada(d)) return; o.ci = d; o.co = null; }
    else if (d <= o.ci){ if (this.ocupada(d)) return; o.ci = d; }
    else if (!this.livreEntre(o.ci, d)){ if (!this.ocupada(d)){ o.ci = d; o.co = null; } else { o.onErro && o.onErro('Há datas ocupadas nesse período.'); return; } }
    else {
      const n = dias(o.ci, d);
      if (o.minNoites && n < o.minNoites){ o.onErro && o.onErro(`Mínimo de ${o.minNoites} noites.`); return; }
      o.co = d;
    }
    this.render(); o.onChange && o.onChange({ ci:o.ci, co:o.co });
  }
  mesHtml(ym){
    const o = this.op, [y, m] = ym.split('-').map(Number);
    const prim = new Date(Date.UTC(y, m-1, 1)).getUTCDay(), ult = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let h = DIAS_S.map(x => `<span class="dw">${x}</span>`).join('') + '<span></span>'.repeat(prim);
    for (let d = 1; d <= ult; d++){
      const iso = `${ym}-${pad(d)}`, passado = iso < o.hoje, cls = ['dia'];
      if (iso === o.hoje) cls.push('hoje');
      let click = !passado, sub = '';
      if (o.modo === 'dono'){
        const st = o.reservadas?.get(iso);
        if (st) cls.push('res'); else if (o.bloqueios?.has(iso)) cls.push('bloq');
        if (o.marcados?.has(iso)) cls.push('marc');
        if (passado){ cls.push('off'); click = false; }
        sub = st ? 'reserva' : o.bloqueios?.has(iso) ? 'bloq.' : '';
      } else {
        const oc = this.ocupada(iso);
        const escolhendoSaida = o.ci && !o.co && iso > o.ci;
        if (passado){ cls.push('off'); click = false; }
        else if (oc && !(escolhendoSaida && this.livreEntre(o.ci, iso))){ cls.push('oc'); click = !!escolhendoSaida && false; }
        if (o.ci === iso) cls.push('ini');
        if (o.co === iso) cls.push('fim');
        if (o.ci && o.co && iso > o.ci && iso < o.co) cls.push('entre');
        const pkd = (o.pacotes || []).find(p => p.ini <= iso && iso < p.fim);
        if (pkd && !passado && !oc){ cls.push('pac'); sub = pkd.nome.slice(0, 8); }
        else if (!passado && !oc && o.preco) sub = 'R$' + Math.round(o.preco(iso));
      }
      h += click ? `<button type="button" class="${cls.join(' ')}" data-dia="${iso}" aria-label="${fmtD(iso)}">${d}${sub?`<small>${sub}</small>`:''}</button>`
                 : `<span class="${cls.join(' ')}">${d}${sub?`<small>${sub}</small>`:''}</span>`;
    }
    return `<div class="mes"><div class="cal-g">${h}</div></div>`;
  }
  render(){
    const o = this.op, n = o.meses || 1, meses = Array.from({length:n}, (_,i) => addMes(this.inicio, i, 1).slice(0,7));
    const podeVoltar = this.inicio > o.hoje.slice(0,7);
    const titulo = meses.map(m => `${MESES_L[+m.slice(5)-1]} ${m.slice(0,4)}`).join(' · ');
    this.el.innerHTML = `<div class="cal-nav"><button type="button" class="icon-btn" data-nav="-1" ${podeVoltar?'':'disabled style="opacity:.35"'} aria-label="Mês anterior">${I.back}</button><b>${titulo}</b><button type="button" class="icon-btn" data-nav="1" aria-label="Próximo mês">${I.next}</button></div>
      <div class="cal ${n>1?'dois':''}">${meses.map(m => this.mesHtml(m)).join('')}</div>`;
    this.el.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { const v = Number(b.dataset.nav); const novo = addMes(this.inicio, v, 1).slice(0,7); if (novo < o.hoje.slice(0,7)) return; this.inicio = novo; o.onNav && o.onNav(novo); this.render(); });
    this.el.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => this.clique(b.dataset.dia));
  }
}


/* ---------------- documentos dos hóspedes (frente e verso) ---------------- */
const TIPOS_DOC = ['RG', 'CNH', 'CPF', 'Certidão de nascimento', 'Passaporte', 'RNE/CRNM'];
const precisaVerso = (tipoDoc, tipoArquivoFrente) => ['RG','CNH','CPF','RNE/CRNM'].includes(tipoDoc) && tipoArquivoFrente !== 'application/pdf';
const opcoesDoc = (sel) => TIPOS_DOC.map(t => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('');

/* ---------------- fotos do imóvel (vistoria) ---------------- */
// lista: [{ i, momento, por, em, url }]; eu: 'hospede' ou 'dono'
function vistoriaHtml(lista, eu, podeEnviar){
  const grupo = (m, titulo) => {
    const fs = lista.filter(f => f.momento === m);
    return `<div style="margin-top:12px"><b style="font-size:14px">${titulo}</b> <span class="hint">${fs.length} foto${fs.length===1?'':'s'}</span>
      <div class="photos">${fs.map(f => `<div class="ph"><a href="${f.url}" target="_blank" rel="noopener"><img src="${f.url}" alt="Foto da ${titulo.toLowerCase()}" loading="lazy"></a><span class="star" style="color:#fff">${f.por === eu ? 'você' : (f.por === 'dono' ? 'dono' : 'hóspede')}</span>${f.por === eu && podeEnviar ? `<button class="x" data-del-vist="${f.i}" aria-label="Apagar">✕</button>` : ''}</div>`).join('') || '<span class="hint">Nenhuma foto ainda.</span>'}</div>
      ${podeEnviar ? `<label class="btn btn-ghost btn-sm" style="margin-top:10px">${I.cam} Adicionar fotos da ${titulo.toLowerCase()}<input type="file" accept="image/*" multiple data-vist="${m}" hidden></label>` : ''}</div>`;
  };
  return grupo('entrada', 'Entrada') + grupo('saida', 'Saída');
}
// liga os botões de enviar e apagar; enviarFn(corpo) e apagarFn(idx) chamam o servidor
function prepararVistoria(raiz, enviarFn, apagarFn, depois){
  $$('[data-vist]', raiz).forEach(inp => inp.onchange = async () => {
    const fs = [...inp.files];
    let ok = 0;
    for (const [k, file] of fs.entries()){
      try { toast(`Enviando foto ${k+1} de ${fs.length}...`); const a = await prepararArquivo(file, { maxLado:1600, qualidade:.8 }); await enviarFn({ momento: inp.dataset.vist, dados:a.dados, tipo:a.tipo }); ok++; }
      catch(e){ toast(e.message); break; }
    }
    if (ok) toast(`✅ ${ok} foto${ok>1?'s':''} enviada${ok>1?'s':''}`);
    depois();
  });
  $$('[data-del-vist]', raiz).forEach(b => b.onclick = async (e) => { e.preventDefault(); if (!confirm('Apagar esta foto?')) return; try { await apagarFn(Number(b.dataset.delVist)); depois(); } catch(err){ toast(err.message); } });
}
