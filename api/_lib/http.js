// Ajudantes de requisição e resposta (funciona na Vercel e no servidor de teste local)

export async function lerCorpo(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; } }
    return req.body;
  }
  const bruto = await lerBruto(req);
  if (!bruto.length) return {};
  try { return JSON.parse(bruto.toString('utf8')); } catch { return {}; }
}

export function lerBruto(req) {
  return new Promise((ok, falha) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', falha);
  });
}

export function parametros(req) {
  const u = new URL(req.url, 'http://local');
  return Object.fromEntries(u.searchParams.entries());
}

export function enviar(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function ipDe(req) {
  const f = req.headers['x-forwarded-for'];
  return (Array.isArray(f) ? f[0] : String(f || '')).split(',')[0].trim() || req.socket?.remoteAddress || '0';
}

// erro com mensagem para mostrar ao usuário
export class Erro extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export function rota(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof Erro) return enviar(res, e.status, { erro: e.message });
      console.error(e);
      // falta de configuração na Vercel aparece com a mensagem clara
      if (/não configurado/.test(e.message)) return enviar(res, 500, { erro: e.message });
      enviar(res, 500, { erro: 'Erro no servidor. Tente de novo em instantes.' });
    }
  };
}
