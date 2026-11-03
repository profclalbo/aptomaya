// Tipo do site:
//  - 'condominio': site geral da pousada (todas as unidades, área de cada dono, parcelas e condomínio)
//  - 'individual': site de um proprietário só (ex.: Apto 4 Maya), com uma ou mais unidades dele
// A variável SITE_MODO na Vercel tem prioridade sobre o valor abaixo.
export const MODO_PADRAO = 'individual';
export const MODO = process.env.SITE_MODO === 'individual' || process.env.SITE_MODO === 'condominio' ? process.env.SITE_MODO : MODO_PADRAO;
export const individual = () => MODO === 'individual';
