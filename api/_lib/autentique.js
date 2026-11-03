// Integração com a Autentique (assinatura eletrônica). Variáveis na Vercel:
// AUTENTIQUE_TOKEN (chave da API) e AUTENTIQUE_SANDBOX (1 = modo de teste, 0 = valendo).
const URL_API = process.env.AUTENTIQUE_URL || 'https://api.autentique.com.br/v2/graphql';
export const autentiqueLigada = () => !!process.env.AUTENTIQUE_TOKEN;
export const autentiqueTeste = () => process.env.AUTENTIQUE_SANDBOX !== '0';

async function gql(query, variables, arquivo) {
  const headers = { Authorization: `Bearer ${process.env.AUTENTIQUE_TOKEN}` };
  let body;
  if (arquivo) {
    const fd = new FormData();
    fd.append('operations', JSON.stringify({ query, variables: { ...variables, file: null } }));
    fd.append('map', JSON.stringify({ file: ['variables.file'] }));
    fd.append('file', new Blob([arquivo.buf], { type: 'application/pdf' }), arquivo.nome);
    body = fd;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ query, variables });
  }
  const r = await fetch(URL_API, { method: 'POST', headers, body, signal: AbortSignal.timeout(25000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) {
    console.error('Autentique', r.status, JSON.stringify(j.errors || j).slice(0, 500));
    const m = j.errors?.[0]?.message || `erro ${r.status}`;
    throw new Error('Autentique: ' + m);
  }
  return j.data;
}

const CRIAR = `mutation Criar($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
  createDocument(sandbox: SANDBOX, document: $document, signers: $signers, file: $file) {
    id name created_at
    signatures { public_id name email action { name } link { short_link } }
  }
}`;

// signatarios: [{ nome, cpf? }] -> devolve { id, links: [short_link por signatário, na mesma ordem] }
export async function criarDocumento({ nome, buf, signatarios, mensagem }) {
  const q = CRIAR.replace('SANDBOX', autentiqueTeste() ? 'true' : 'false');
  const signers = signatarios.map((s) => {
    const o = { name: s.nome, action: 'SIGN' };
    const cpf = String(s.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11) o.configs = { cpf };
    return o;
  });
  const d = await gql(q, { document: { name: nome, message: mensagem || '', refusable: true, locale: { country: 'BR', language: 'pt-BR' } }, signers }, { buf, nome: nome.replace(/[^\w.-]+/g, '-') + '.pdf' });
  const doc = d.createDocument;
  // a Autentique pode devolver também a assinatura do dono da conta; casa os links pelo nome
  const links = signatarios.map((s) => {
    const sig = doc.signatures.find((x) => x.name && x.name.trim().toLowerCase() === s.nome.trim().toLowerCase() && x.link?.short_link);
    return sig?.link?.short_link || '';
  });
  return { id: doc.id, links };
}

const CONSULTA = `query {
  document(id: "ID_DOC") {
    id name
    files { original signed }
    signatures { public_id name email link { short_link } signed { created_at } rejected { created_at reason } viewed { created_at } }
  }
}`;
export async function consultarDocumento(id) {
  const d = await gql(CONSULTA.replace('ID_DOC', String(id).replace(/[^A-Za-z0-9-]/g, '')), {});
  return d.document;
}
// baixa o PDF assinado (a URL da Autentique pede a mesma chave)
export async function baixarAssinado(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AUTENTIQUE_TOKEN}` }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('Autentique: não consegui baixar o PDF assinado (' + r.status + ')');
  return Buffer.from(await r.arrayBuffer());
}
