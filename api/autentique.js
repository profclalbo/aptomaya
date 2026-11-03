// Webhook da Autentique: avisa quando alguém assina. Cadastre no painel da Autentique a URL
// https://SEU-SITE/api/autentique e copie o segredo para a variável AUTENTIQUE_WEBHOOK_SECRET.
import crypto from 'node:crypto';
import { rota, lerBruto, enviar } from './_lib/http.js';
import { ler } from './_lib/db.js';
import { iguais } from './_lib/auth.js';
import { carregar, salvarReserva, atualizarAutentique } from './_lib/reservas.js';

export const config = { api: { bodyParser: false } };

export default rota(async (req, res) => {
  if (req.method !== 'POST') return enviar(res, 200, { ok: true });
  const bruto = await lerBruto(req);
  const segredo = process.env.AUTENTIQUE_WEBHOOK_SECRET;
  if (segredo) {
    const recebida = String(req.headers['x-autentique-signature'] || '');
    const certa = crypto.createHmac('sha256', segredo).update(bruto).digest('hex');
    if (!recebida || !iguais(recebida, certa)) return enviar(res, 401, { erro: 'assinatura inválida' });
  }
  let ev = {};
  try { ev = JSON.parse(bruto.toString('utf8')); } catch { return enviar(res, 400, { erro: 'json' }); }
  const obj = ev?.event?.data?.object || ev?.data?.object || {};
  // em eventos de assinatura o documento vem dentro do objeto
  const docId = obj.document?.id || obj.document_id || (String(ev?.event?.type || '').startsWith('document') ? obj.id : null);
  if (!docId) return enviar(res, 200, { ok: true, ignorado: true });
  const reservaId = await ler('autdoc:' + docId);
  if (!reservaId) return enviar(res, 200, { ok: true, ignorado: true });
  const r = await carregar(reservaId);
  await atualizarAutentique(req, r);
  await salvarReserva(r);
  enviar(res, 200, { ok: true });
});
