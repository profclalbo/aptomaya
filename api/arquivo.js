// Abre um documento privado (link temporário assinado) ou uma foto do teste local
import { rota, parametros, Erro } from './_lib/http.js';
import { verificar } from './_lib/auth.js';
import { lerPrivado, lerPublicoLocal } from './_lib/arquivos.js';

export default rota(async (req, res) => {
  const q = parametros(req);
  if (q.pub) {
    if (process.env.VERCEL) throw new Erro('Não encontrado.', 404);
    const buf = lerPublicoLocal(q.pub);
    res.setHeader('Content-Type', q.pub.endsWith('.png') ? 'image/png' : q.pub.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(buf);
  }
  const d = await verificar(q.f);
  if (!d?.k) throw new Erro('Link vencido. Volte à página e abra o arquivo de novo.', 403);
  const buf = await lerPrivado(d.k);
  res.statusCode = 200;
  res.setHeader('Content-Type', d.ct || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${q.baixar ? 'attachment' : 'inline'}; filename="${String(d.n || 'arquivo').replace(/[^\w.-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buf);
});
