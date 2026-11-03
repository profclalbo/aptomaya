// Pix copia e cola (BR Code estático)
export function crc16(t) {
  let c = 0xffff;
  for (let i = 0; i < t.length; i++) { c ^= t.charCodeAt(i) << 8; for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
const campo = (id, v) => { v = String(v); return id + String(v.length).padStart(2, '0') + v; };
const limpa = (t, max) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, max);
export function codigoPix({ chave, nome, cidade }, valor, txid) {
  const tx = String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  let c = campo('00', '01') + campo('26', campo('00', 'BR.GOV.BCB.PIX') + campo('01', String(chave).trim())) + campo('52', '0000') + campo('53', '986');
  if (valor > 0) c += campo('54', Number(valor).toFixed(2));
  c += campo('58', 'BR') + campo('59', limpa(nome, 25) || 'RECEBEDOR') + campo('60', limpa(cidade, 15) || 'SAO PAULO') + campo('62', campo('05', tx)) + '6304';
  return c + crc16(c);
}
