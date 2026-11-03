// Contrato de locação para temporada em PDF (pdf-lib)
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { brl, fmtD } from './condo.js';
import { COMODIDADES } from './temporada.js';

// ---------- valor por extenso ----------
const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CT[c]);
  if (r) p.push(r < 20 ? UN[r] : DZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : ''));
  return p.join(' e ');
}
function inteiroExtenso(n) {
  if (n === 0) return 'zero';
  const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000, p = [];
  if (mi) p.push(mi === 1 ? 'um milhão' : ate999(mi) + ' milhões');
  if (mil) p.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
  if (r) p.push(ate999(r));
  // regra do "e": usa "e" antes do último grupo quando ele é < 100 ou centena redonda
  if (p.length > 1 && r && (r < 100 || r % 100 === 0)) return p.slice(0, -1).join(' ') + ' e ' + p[p.length - 1];
  return p.join(' ');
}
export function extenso(valor) {
  const cents = Math.round(Number(valor) * 100), reais = Math.floor(cents / 100), cent = cents % 100;
  let t = '';
  if (reais) t = inteiroExtenso(reais) + (reais === 1 ? ' real' : (reais % 1e6 === 0 ? ' de reais' : ' reais'));
  if (cent) t += (t ? ' e ' : '') + inteiroExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos');
  return t || 'zero real';
}
const valorExt = (v) => `${brl(v)} (${extenso(v)})`;

// ---------- montagem do texto ----------
function qualifica(p, docLabel = 'RG') {
  const partes = [String(p.nome || '').toUpperCase()];
  if (p.nacionalidade) partes.push(p.nacionalidade);
  if (p.estadoCivil) partes.push(p.estadoCivil);
  if (p.profissao) partes.push(p.profissao);
  if (p.nascimento) partes.push(`nascido(a) em ${fmtD(p.nascimento)}`);
  if (p.rg) partes.push(`portador(a) do ${docLabel} nº ${p.rg}`);
  if (p.cpf) partes.push(`inscrito(a) no CPF sob o nº ${p.cpf}`);
  if (p.endereco) partes.push(`residente e domiciliado(a) em ${p.endereco}`);
  if (p.email) partes.push(`e-mail ${p.email}`);
  if (p.whats) partes.push(`telefone ${p.whats}`);
  return partes.join(', ');
}

export function textoContrato({ cfg, u, anuncio: a, dono, r }) {
  const v = r.valores;
  const ocupantes = [
    { nome: r.titular.nome, doc: [r.titular.rg && `RG ${r.titular.rg}`, r.titular.cpf && `CPF ${r.titular.cpf}`].filter(Boolean).join(', '), nasc: r.titular.nascimento },
    ...(r.acompanhantes || []).map((x) => ({ nome: x.nome, doc: x.documento, nasc: x.nascimento })),
  ];
  const comod = (a.comodidades || []).map((k) => COMODIDADES[k]).filter(Boolean);
  const cl = [];
  let n = 0;
  const C = (titulo, ...pars) => cl.push({ titulo: `CLÁUSULA ${++n}ª - ${titulo}`, pars: pars.flat().filter(Boolean) });

  C('DO OBJETO',
    `O LOCADOR dá em locação ao LOCATÁRIO, para fins exclusivamente residenciais de temporada (lazer e descanso), a unidade ${u.nome} (${cfg.planos[u.tipo]?.nome || ''}, ${u.piso}) do ${cfg.cond.nome}, situado em ${cfg.cond.endereco}, mobiliada e equipada, com capacidade máxima de ${a.capacidade} (${inteiroExtenso(Number(a.capacidade))}) pessoas.`,
    comod.length ? `Parágrafo único. A unidade é entregue com: ${comod.join(', ')}, além dos móveis e utensílios que a guarnecem, conforme o anúncio aceito pelo LOCATÁRIO.` : '');
  C('DO PRAZO',
    `A locação vigorará de ${fmtD(r.ci)}, com entrada a partir das ${r.checkin || a.checkin}, até ${fmtD(r.co)}, com saída até as ${r.checkout || a.checkout}, totalizando ${v.noites} (${inteiroExtenso(v.noites)}) diária${v.noites > 1 ? 's' : ''}, prazo não superior a 90 (noventa) dias, nos termos do art. 48 da Lei nº 8.245/1991.`,
    'Parágrafo único. Findo o prazo, o LOCATÁRIO restituirá o imóvel independentemente de aviso ou notificação. A permanência sem a concordância expressa do LOCADOR sujeitará o LOCATÁRIO ao pagamento de valor equivalente a uma diária e meia por dia excedente, sem prejuízo das medidas legais cabíveis.');
  C('DOS OCUPANTES',
    `O imóvel será ocupado exclusivamente pelas ${ocupantes.length} (${inteiroExtenso(ocupantes.length)}) pessoas abaixo relacionadas, cujos dados de identificação foram informados ao LOCADOR, sendo vedada a ocupação por terceiros ou por número de pessoas superior à capacidade da unidade:`,
    ocupantes.map((o, i) => `${i + 1}. ${o.nome}${o.doc ? ` - ${o.doc}` : ''}${o.nasc ? ` - nascido(a) em ${fmtD(o.nasc)}` : ''}`));
  C('DO PREÇO E DO PAGAMENTO',
    v.pacote
      ? `O valor total da locação é de ${valorExt(v.somaDiarias + v.limpeza)}, correspondente ao pacote ${v.pacote.nome} (${v.noites} diárias), no valor de ${brl(v.pacote.casal)} para o casal${v.pacote.acompanhantes ? ` e ${brl(v.pacote.acompanhante)} por acompanhante a partir de ${v.pacote.idadeMin} anos (${v.pacote.acompanhantes} acompanhante${v.pacote.acompanhantes > 1 ? 's' : ''})` : ''}, isentas as crianças com até ${v.pacote.idadeMin - 1} anos${v.limpeza ? `, acrescido da taxa de limpeza de ${brl(v.limpeza)}` : ''}.`
      : `O valor total da locação é de ${valorExt(v.somaDiarias + v.limpeza)}, correspondente a ${v.noites} diária${v.noites > 1 ? 's' : ''} no total de ${brl(v.somaDiarias)}${v.limpeza ? ` e taxa de limpeza de ${brl(v.limpeza)}` : ''}.`,
    (v.restante || 0) > 0
      ? `O pagamento será feito por Pix à chave ${r.pix.chave}, de titularidade de ${r.pix.nome}, em duas partes: (a) sinal de ${valorExt(v.sinal)}, equivalente a ${v.sinalPct}% do valor total${v.caucao ? ', incluída a caução' : ''}, pago na reserva, que fica garantida com a sua confirmação. O sinal é dado como arras, é abatido do valor total e não será devolvido em caso de desistência do LOCATÁRIO (arts. 417 e 418 do Código Civil); e (b) o restante de ${valorExt(v.restante)}, pago no dia da entrada no imóvel (${fmtD(r.ci)}), antes da entrega das chaves. O pagamento antecipado é permitido pelo art. 49 da Lei nº 8.245/1991, e os comprovantes de transferência valem como recibo.`
      : `O pagamento é feito antecipadamente e de uma só vez, por Pix à chave ${r.pix.chave}, de titularidade de ${r.pix.nome}, conforme autoriza o art. 49 da Lei nº 8.245/1991, valendo o comprovante de transferência como recibo.`);
  if (v.caucao > 0) C('DA CAUÇÃO',
    `O LOCATÁRIO entrega ao LOCADOR, junto com o pagamento, caução em dinheiro de ${valorExt(v.caucao)}, para garantia das obrigações deste contrato (arts. 37, I, e 38 da Lei nº 8.245/1991).`,
    'A caução será devolvida em até 5 (cinco) dias úteis após a desocupação e a vistoria do imóvel, por Pix à conta indicada pelo LOCATÁRIO, descontados os valores de eventuais danos, extravios, multas condominiais ou despesas de responsabilidade do LOCATÁRIO, mediante demonstração.');
  C('DAS OBRIGAÇÕES DO LOCATÁRIO',
    'O LOCATÁRIO obriga-se a: (a) utilizar o imóvel com zelo, apenas para a finalidade contratada; (b) cumprir o regimento interno do condomínio e as regras da unidade; (c) não sublocar, ceder ou emprestar o imóvel, no todo ou em parte; (d) responder pelos danos causados por si, por seus acompanhantes e visitantes; (e) restituir o imóvel, as chaves, os móveis e utensílios no estado em que os recebeu, ressalvado o desgaste natural do uso; (f) permitir a vistoria do imóvel pelo LOCADOR, mediante aviso prévio.',
    a.regras ? ['Regras da unidade, que o LOCATÁRIO declara conhecer e aceitar:', ...String(a.regras).split('\n').filter((l) => l.trim()).map((l) => `- ${l.trim()}`)] : '');
  C('DAS OBRIGAÇÕES DO LOCADOR',
    `O LOCADOR obriga-se a: (a) entregar o imóvel limpo, em condições de uso e com os itens anunciados; (b) garantir ao LOCATÁRIO o uso pacífico do imóvel durante a locação; (c) informar as regras do condomínio e da unidade${v.caucao > 0 ? '; (d) devolver a caução nos termos deste contrato' : ''}.`);
  C('DO CANCELAMENTO',
    'Em caso de desistência, aplicam-se as condições abaixo, aceitas pelo LOCATÁRIO no momento da reserva:',
    String(a.cancelamento || '').split('\n').filter((l) => l.trim()).map((l) => `- ${l.trim()}`),
    'Se o cancelamento partir do LOCADOR, os valores pagos serão devolvidos integralmente.');
  C('DA VISTORIA E DOS DANOS',
    'As partes poderão registrar por fotos o estado do imóvel na entrada e na saída. Danos ou faltas constatados serão comunicados ao LOCATÁRIO em até 48 (quarenta e oito) horas após a saída, com a respectiva comprovação.');
  if (a.observacoesContrato) C('DISPOSIÇÕES ADICIONAIS', String(a.observacoesContrato).split('\n').filter((l) => l.trim()));
  C('DOS DADOS PESSOAIS',
    'Os dados pessoais e as cópias de documentos fornecidos serão tratados exclusivamente para a execução deste contrato, a identificação dos ocupantes, a segurança do condomínio e o cumprimento de obrigações legais, nos termos do art. 7º, II e V, da Lei nº 13.709/2018 (LGPD), e serão guardados apenas pelo tempo necessário a essas finalidades.');
  C('DA ASSINATURA ELETRÔNICA',
    'As partes reconhecem a validade, a autoria e a integridade deste contrato assinado por meio eletrônico, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, dispensada a assinatura de testemunhas.',
    'Admitem também como válido o aceite eletrônico deste contrato por código de uso único enviado ao WhatsApp do LOCATÁRIO informado na reserva, e o aceite do LOCADOR em sua área protegida por senha, com o registro de data, hora, endereço IP, aparelho e código de integridade (SHA-256) do documento, reunidos em página de comprovação anexa.');
  C('DO FORO',
    `Fica eleito o foro da Comarca de ${cfg.cond.comarca || 'Itanhaém/SP'} para dirimir quaisquer questões oriundas deste contrato.`);

  return {
    titulo: 'CONTRATO DE LOCAÇÃO DE IMÓVEL PARA TEMPORADA',
    sub: `${cfg.cond.nome} · ${u.nome} · Reserva ${r.id}`,
    abertura: [
      `LOCADOR(A): ${qualifica(dono)}.`,
      `LOCATÁRIO(A): ${qualifica(r.titular)}.`,
      'As partes acima qualificadas têm entre si justo e contratado a locação para temporada do imóvel abaixo descrito, que se regerá pelos arts. 48 a 50 da Lei nº 8.245/1991 (Lei do Inquilinato) e pelas cláusulas seguintes.',
    ],
    clausulas: cl,
    fecho: 'E, por estarem de acordo, as partes assinam o presente contrato eletronicamente.',
    local: `${(cfg.cond.comarca || 'Itanhaém/SP').replace('/', ' - ')}, ${fmtD(r.confirmadaEm || r.criadoEm)}.`,
    assinaturas: [
      { papel: 'LOCADOR(A)', nome: dono.nome, doc: dono.cpf ? `CPF ${dono.cpf}` : '' },
      { papel: 'LOCATÁRIO(A)', nome: r.titular.nome, doc: r.titular.cpf ? `CPF ${r.titular.cpf}` : '' },
    ],
  };
}

// ---------- PDF ----------
export async function gerarPdfContrato(dados) {
  const t = textoContrato(dados);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Contrato de temporada - ${dados.u.nome} - ${dados.r.id}`);
  pdf.setAuthor(dados.cfg.cond.nome);
  const fN = await pdf.embedFont(StandardFonts.TimesRoman);
  const fB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const W = 595.28, H = 841.89, M = 62, larg = W - 2 * M;
  const COR = rgb(0.08, 0.12, 0.18), CINZA = rgb(0.42, 0.47, 0.53), MAR = rgb(0.09, 0.48, 0.55);

  // tira caracteres que a fonte do PDF não tem
  const cache = new Map();
  const limpar = (s, f) => String(s).replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...')
    .split('').filter((ch) => {
      const k = ch + (f === fB ? 'b' : 'n');
      if (!cache.has(k)) { try { f.encodeText(ch); cache.set(k, true); } catch { cache.set(k, false); } }
      return cache.get(k);
    }).join('');

  let pg, y;
  const novaPagina = () => { pg = pdf.addPage([W, H]); y = H - M; };
  novaPagina();
  const garante = (h) => { if (y - h < M + 20) novaPagina(); };

  // escreve um parágrafo com quebra de linha (justificado)
  function paragrafo(txt, { f = fN, tam = 11, cor = COR, recuo = 0, justificar = true, entre = 7, centro = false } = {}) {
    txt = limpar(txt, f);
    const pal = txt.split(/\s+/).filter(Boolean), lh = tam * 1.42, maxW = larg - recuo;
    const esp = f.widthOfTextAtSize(' ', tam);
    let linha = [];
    const linhas = [];
    for (const p of pal) {
      const teste = [...linha, p].join(' ');
      if (f.widthOfTextAtSize(teste, tam) > maxW && linha.length) { linhas.push(linha); linha = [p]; }
      else linha.push(p);
    }
    if (linha.length) linhas.push(linha);
    linhas.forEach((ws, i) => {
      garante(lh);
      const ultima = i === linhas.length - 1;
      const larguraTexto = ws.reduce((s, w) => s + f.widthOfTextAtSize(w, tam), 0);
      if (centro) {
        const tw = f.widthOfTextAtSize(ws.join(' '), tam);
        pg.drawText(ws.join(' '), { x: M + (larg - tw) / 2, y: y - tam, size: tam, font: f, color: cor });
      } else if (justificar && !ultima && ws.length > 1) {
        const gap = (maxW - larguraTexto) / (ws.length - 1);
        let x = M + recuo;
        for (const w of ws) { pg.drawText(w, { x, y: y - tam, size: tam, font: f, color: cor }); x += f.widthOfTextAtSize(w, tam) + gap; }
      } else {
        pg.drawText(ws.join(' '), { x: M + recuo, y: y - tam, size: tam, font: f, color: cor });
      }
      y -= lh;
      void esp;
    });
    y -= entre;
  }

  // cabeçalho
  pg.drawRectangle({ x: M, y: y - 3, width: larg, height: 3, color: MAR });
  y -= 22;
  paragrafo(t.titulo, { f: fB, tam: 14.5, centro: true, entre: 2 });
  paragrafo(t.sub, { tam: 10, cor: CINZA, centro: true, entre: 16 });
  for (const p of t.abertura) paragrafo(p);
  y -= 4;
  for (const c of t.clausulas) {
    garante(60);
    paragrafo(c.titulo, { f: fB, tam: 11, justificar: false, entre: 4 });
    for (const p of c.pars) {
      const item = /^(\d+\.|-)\s/.test(p);
      paragrafo(p, { recuo: item ? 14 : 0, entre: item ? 3 : 7, justificar: !item });
    }
    y -= 5;
  }
  paragrafo(t.fecho, { entre: 10 });
  paragrafo(t.local, { justificar: false, entre: 34 });
  // assinaturas
  garante(150);
  for (const a of t.assinaturas) {
    garante(70);
    pg.drawLine({ start: { x: M + 70, y }, end: { x: W - M - 70, y }, thickness: 0.8, color: COR });
    y -= 6;
    paragrafo(a.nome, { f: fB, tam: 11, centro: true, entre: 0 });
    paragrafo(`${a.papel}${a.doc ? ' - ' + a.doc : ''}`, { tam: 10, cor: CINZA, centro: true, entre: 34 });
  }
  // rodapé com numeração
  const pags = pdf.getPages();
  pags.forEach((p, i) => {
    const txt = limpar(`Contrato de temporada · Reserva ${dados.r.id} · Página ${i + 1} de ${pags.length}`, fN);
    const tw = fN.widthOfTextAtSize(txt, 8.5);
    p.drawText(txt, { x: (W - tw) / 2, y: 30, size: 8.5, font: fN, color: CINZA });
  });
  return Buffer.from(await pdf.save());
}

// ---------- aceite eletrônico por código: página de comprovação anexada ao contrato ----------
const dataHoraBR = (iso) => {
  const d = new Date(Date.parse(iso) - 3 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} (horário de Brasília)`;
};
const finalFone = (f) => { const d = String(f || '').replace(/\D/g, ''); return d.length >= 4 ? `final ${d.slice(-4)}` : ''; };
export async function anexarManifesto(original, { r, u, cfg, aceite, hash }) {
  const pdf = await PDFDocument.load(original);
  const fN = await pdf.embedFont(StandardFonts.Helvetica);
  const fB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56, larg = W - 2 * M;
  const COR = rgb(0.08, 0.12, 0.18), CINZA = rgb(0.4, 0.45, 0.5), MAR = rgb(0.09, 0.48, 0.55);
  const limpar = (s, f) => String(s ?? '').replace(/[–—]/g, '-').split('').filter((ch) => { try { f.encodeText(ch); return true; } catch { return false; } }).join('');
  let pg = pdf.addPage([W, H]), y = H - M;
  const linha = (txt, { f = fN, tam = 10, cor = COR, recuo = 0 } = {}) => {
    const pal = limpar(txt, f).split(/\s+/).filter(Boolean); let atual = '';
    const sai = (t) => { if (y < M + 20) { pg = pdf.addPage([W, H]); y = H - M; } pg.drawText(t, { x: M + recuo, y, size: tam, font: f, color: cor }); y -= tam * 1.45; };
    for (const w of pal) { const t = atual ? atual + ' ' + w : w; if (f.widthOfTextAtSize(t, tam) > larg - recuo && atual) { sai(atual); atual = w; } else atual = t; }
    if (atual) sai(atual);
  };
  linha('MANIFESTO DE ASSINATURA ELETRÔNICA', { f: fB, tam: 15, cor: MAR }); y -= 4;
  linha(`Contrato de locação por temporada - Reserva ${r.id} - ${u.nome} - ${cfg.cond.nome}`, { f: fB, tam: 10.5 });
  linha(`Período: ${r.ci.split('-').reverse().join('/')} a ${r.co.split('-').reverse().join('/')}`, { tam: 10 }); y -= 6;
  linha('Código de integridade do documento original (SHA-256):', { f: fB, tam: 9.5 });
  linha(hash, { tam: 8.6, cor: CINZA }); y -= 8;
  const bloco = (titulo, a) => {
    linha(titulo, { f: fB, tam: 11, cor: MAR });
    if (!a) { linha('Ainda sem aceite.', { tam: 10, recuo: 10 }); y -= 6; return; }
    linha(`Nome: ${a.nome || '-'}`, { recuo: 10 });
    if (a.cpf) { const c = String(a.cpf).replace(/\D/g, ''); linha(`CPF: ${c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : a.cpf}`, { recuo: 10 }); }
    linha(`Aceite em: ${dataHoraBR(a.em)}`, { recuo: 10 });
    linha(`Forma de confirmação: ${a.canal || '-'}${a.whats ? ` (WhatsApp ${finalFone(a.whats)})` : ''}`, { recuo: 10 });
    linha(`Endereço IP: ${a.ip || '-'}`, { recuo: 10 });
    linha(`Aparelho: ${a.aparelho || '-'}`, { recuo: 10, tam: 8.6, cor: CINZA });
    linha(`Código de integridade conferido no aceite: ${a.hash === hash ? 'igual ao do documento original' : 'DIFERENTE'}`, { recuo: 10, tam: 9 });
    y -= 8;
  };
  bloco('LOCADOR', aceite.locador);
  bloco('LOCATÁRIO', aceite.locatario);
  y -= 4;
  linha('As partes aceitaram este contrato por meio eletrônico, forma que admitiram como válida na cláusula de assinatura eletrônica, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. O aceite do LOCATÁRIO foi confirmado por código de uso único enviado ao WhatsApp informado na reserva; o do LOCADOR, em sua área protegida por senha. Qualquer alteração no documento original muda o código de integridade acima.', { tam: 9, cor: CINZA });
  return Buffer.from(await pdf.save());
}
