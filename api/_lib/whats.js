// WhatsApp automático pela PAPI (opcional). A instância e a chave ficam nas variáveis da Vercel:
// PAPI_INSTANCIA (ex.: motorista) e PAPI_CHAVE. Sem elas, o app usa os botões que abrem o WhatsApp.
export const papiLigada = () => !!(process.env.PAPI_INSTANCIA && process.env.PAPI_CHAVE);

export function jid(fone) {
  let j = String(fone || '').replace(/\D/g, '');
  if (j && j.length <= 11) j = '55' + j;
  return j;
}

// devolve { ok, motivo? }
export async function enviarWhats(fone, texto) {
  if (!papiLigada()) return { ok: false, motivo: 'PAPI não configurada' };
  const j = jid(fone);
  if (j.length < 12) return { ok: false, motivo: 'Telefone inválido' };
  const base = String(process.env.PAPI_URL || 'https://api.papi.api.br').replace(/\/+$/, '');
  try {
    const r = await fetch(`${base}/api/instances/${encodeURIComponent(process.env.PAPI_INSTANCIA)}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.PAPI_CHAVE },
      body: JSON.stringify({ jid: j, text: texto }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('PAPI', r.status, t.slice(0, 300));
      return { ok: false, motivo: r.status === 401 || r.status === 403 ? 'A PAPI recusou a chave' : `A PAPI respondeu com erro (${r.status})` };
    }
    return { ok: true };
  } catch (e) {
    console.error('PAPI', e.message);
    return { ok: false, motivo: 'Não foi possível falar com a PAPI agora' };
  }
}
