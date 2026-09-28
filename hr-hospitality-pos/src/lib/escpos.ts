/**
 * Codificador ESC/POS — TypeScript puro, sem uma única dependência nativa.
 *
 * Monta o fluxo de bytes real que a impressora térmica entende (init, alinhamento,
 * negrito, tamanho de caractere, tabela de código, feed e corte) e partilha o
 * MESMO layout com o texto simples, pelo que o operador vê no ecrã exatamente o
 * que sai no papel.
 *
 * Larguras de papel à fonte A: 32 colunas em 58 mm, 48 colunas em 80 mm.
 *
 * Acentuação: por omissão o fluxo de bytes translitera para ASCII, porque o
 * código de página de cada impressora é desconhecido (a tabela pode ser CP437,
 * CP850 ou UTF-8 conforme o firmware). O texto de pré-visualização mantém a
 * acentuação original. Quem garantir que a impressora fala UTF-8 pode pedir
 * `encoding: 'UTF8'`.
 */

import { formatAmount, formatDateTime } from '@/lib/format';
import type { PreBillDoc } from '@/types/pos';

export type PaperWidth = '58' | '80';

/** Colunas da fonte A por largura de papel. */
export const PAPER_COLUMNS: Record<PaperWidth, number> = { '58': 32, '80': 48 };

const DEFAULT_COLUMNS = PAPER_COLUMNS['58'];

/* ── Bytes de comando ─────────────────────────────────────────────────────── */

const ESC = 0x1b;
const GS = 0x1d;
const CR = 0x0d;
const LF = 0x0a;

export type Alignment = 'left' | 'center' | 'right';

/** `ESC @` — inicialização e reset da impressora. */
export function initBytes(): number[] {
  return [ESC, 0x40];
}

/** `ESC a n` — alinhamento (0 esquerda, 1 centro, 2 direita). */
export function alignBytes(align: Alignment): number[] {
  return [ESC, 0x61, align === 'left' ? 0 : align === 'center' ? 1 : 2];
}

/** `ESC E n` — negrito. */
export function boldBytes(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0];
}

/**
 * `GS ! n` — tamanho do caractere. Bits 0–2 = altura, bits 4–6 = largura
 * (bit 3 e 7 reservados): 1 = altura dupla, 16 = largura dupla.
 */
export function sizeBytes(doubleWidth = false, doubleHeight = false): number[] {
  return [GS, 0x21, (doubleWidth ? 16 : 0) | (doubleHeight ? 1 : 0)];
}

/** `ESC t n` — tabela de código do caracter (0 = CP437/EUA). */
export function charsetBytes(table = 0): number[] {
  return [ESC, 0x74, table & 0xff];
}

/** `ESC d n` — avança n linhas. */
export function feedBytes(lines = 1): number[] {
  return [ESC, 0x64, Math.max(0, Math.min(255, Math.trunc(lines)))];
}

/** `GS V m` — corte (48 total, 49 parcial). */
export function cutBytes(mode: 'full' | 'partial' = 'partial'): number[] {
  return [GS, 0x56, mode === 'full' ? 48 : 49];
}

/* ── Codificação de texto ─────────────────────────────────────────────────── */

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

/** Tabela pt-PT: o que a CP437 não distingue sai sempre legível. */
const ACCENT_FALLBACK: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ÿ: 'y',
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A',
  É: 'E', È: 'E', Ê: 'E', Ë: 'E',
  Í: 'I', Ì: 'I', Î: 'I', Ï: 'I',
  Ó: 'O', Ò: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ø: 'O',
  Ú: 'U', Ù: 'U', Û: 'U', Ü: 'U',
  Ç: 'C', Ñ: 'N',
  '–': '-', '—': '-', '―': '-', '×': 'x', '÷': '-', '…': '...', '•': '*', 'ª': 'a', 'º': 'o',
};

/**
 * Reduz o texto a caracteres ASCII seguros para qualquer código de página.
 * Acentos tornam-se letras; o resto (símbolos exóticos) fica '?'.
 */
export function toPrinterText(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = ACCENT_FALLBACK[ch];
    if (mapped !== undefined) out += mapped;
    else if (ch.charCodeAt(0) < 128) out += ch;
    else if (ch.charCodeAt(0) === 160) out += ' ';
    else out += '?';
  }
  return out;
}

/* ── Formatação de colunas ────────────────────────────────────────────────── */

/** Corta sem partir caracteres; enche a coluna quando sobra espaço. */
export function padRight(text: string, width: number = DEFAULT_COLUMNS): string {
  const chars = Array.from(text);
  if (chars.length > width) return chars.slice(0, Math.max(0, width)).join('');
  return text + ' '.repeat(width - chars.length);
}

export function padLeft(text: string, width: number = DEFAULT_COLUMNS): string {
  const chars = Array.from(text);
  if (chars.length > width) return chars.slice(chars.length - Math.max(0, width)).join('');
  return ' '.repeat(width - chars.length) + text;
}

/** Linha centrada dentro da largura do papel. */
export function centeredLine(text: string, width: number = DEFAULT_COLUMNS): string {
  const chars = Array.from(text);
  if (chars.length >= width) return chars.slice(0, width).join('');
  const spare = width - chars.length;
  const left = Math.floor(spare / 2);
  return ' '.repeat(left) + text + ' '.repeat(spare - left);
}

/** Chave à esquerda, valor à direita — a linha base de qualquer recibo. */
export function kvLine(key: string, value: string, width: number = DEFAULT_COLUMNS): string {
  const right = Array.from(value);
  if (right.length >= width) return right.slice(0, width).join('');
  return padRight(key, width - right.length) + value;
}

/** Traço de separação à largura do papel. */
export function separator(width: number = DEFAULT_COLUMNS, char = '-'): string {
  return char.repeat(Math.max(0, width));
}

function formatQuantity(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return quantity.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Linha de artigo: `2 x Água mineral   1.200,00`.
 * `price` aceita número (formata com vírgula decimal) ou texto já formatado.
 */
export function itemLine(
  name: string,
  quantity: number,
  price: number | string,
  width: number = DEFAULT_COLUMNS,
): string {
  const value = typeof price === 'number' ? formatAmount(price) : price;
  return kvLine(`${formatQuantity(quantity)} x ${name}`, value, width);
}

/** Linha de total, sempre em maiúsculas para o olho apanhar primeiro. */
export function totalLine(label: string, value: string, width: number = DEFAULT_COLUMNS): string {
  return kvLine(label.toUpperCase(), value, width);
}

/**
 * Quebra em linhas monoespaçadas, preferindo a quebra nos espaços: um artigo
 * comprido sai legível em vez de cortado a meio. Palavras maiores que o papel
 * são cortadas com hífen para não estourar a coluna.
 */
export function wrapText(text: string, width: number = DEFAULT_COLUMNS): string[] {
  if (width <= 1) return [text];
  const out: string[] = [];
  let rest = Array.from(text);
  while (rest.length > width) {
    const window = rest.slice(0, width);
    const spaceAt = window.lastIndexOf(' ');
    if (spaceAt > 0) {
      out.push(window.slice(0, spaceAt).join(''));
      rest = rest.slice(spaceAt + 1);
    } else {
      const cut = Math.max(1, width - 1);
      out.push(window.slice(0, cut).join('') + '-');
      rest = rest.slice(cut);
    }
  }
  out.push(rest.join(''));
  return out;
}

/**
 * Uma ou várias linhas de artigo: `2 x Água mineral   1.200,00`. Quando o
 * nome não cabe numa linha, continua nas seguintes e o valor alinha à direita
 * da última — nada fica cortado nem colado ao preço.
 */
export function itemLines(
  name: string,
  quantity: number,
  price: number | string,
  width: number = DEFAULT_COLUMNS,
): string[] {
  const value = typeof price === 'number' ? formatAmount(price) : price;
  const valueWidth = Array.from(value).length;
  const chunks = wrapText(`${formatQuantity(quantity)} x ${name}`, width);
  const lastIndex = chunks.length - 1;
  const out: string[] = [];
  chunks.forEach((chunk, index) => {
    if (index !== lastIndex) {
      out.push(chunk);
      return;
    }
    if (Array.from(chunk).length + valueWidth + 1 <= width) {
      out.push(kvLine(chunk, value, width));
    } else {
      out.push(chunk);
      out.push(kvLine('', value, width));
    }
  });
  return out;
}

/**
 * `GS ( k` — bloco QR, com os quatro passos do protocolo: selecionar modelo,
 * tamanho do módulo, correção de erros, gravar e imprimir.
 *
 * O prefixo é literalmente `1D 28 6B` (GS, '(', 'k') seguido de pL pH, cn e fn
 * — a forma como o manual Epson escreve os comandos de função 2D.
 */
export function qrBlock(text: string): number[] {
  const data = utf8Bytes(text);
  const out: number[] = [];
  // Modelo 2: GS ( k 4 0 49 65 50 0   (cn 49, fn 65, n1 50 = modelo 2, n2 0)
  out.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  // Tamanho do módulo 6: GS ( k 3 0 49 67 6
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
  // Correção de erros M (15%): GS ( k 3 0 49 69 49
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  // Gravar dados: GS ( k pL pH 49 80 48 <dados>   (p = tamanho dos dados + 3)
  const length = data.length + 3;
  out.push(GS, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30, ...data);
  // Imprimir QR: GS ( k 3 0 49 81 48
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  return out;
}

/* ── Layout partilhado ────────────────────────────────────────────────────── */

export type ReceiptLine =
  | { kind: 'text'; text: string; align: Alignment; bold: boolean; double: boolean }
  | { kind: 'qr'; text: string }
  | { kind: 'feed'; lines: number }
  | { kind: 'cut' };

/**
 * Desenha a pré-conta em linhas discretas. É a fonte única de verdade:
 * `buildPreBillText`, `buildPreBillBytes` e o HTML de impressão leem daqui.
 */
export function layoutPreBill(doc: PreBillDoc, opts: { paper: PaperWidth }): ReceiptLine[] {
  const width = PAPER_COLUMNS[opts.paper];
  const lines: ReceiptLine[] = [];

  const push = (text: string, extra: Partial<Extract<ReceiptLine, { kind: 'text' }>> = {}) => {
    for (const chunk of wrapText(text, width)) {
      lines.push({ kind: 'text', text: chunk, align: 'left', bold: false, double: false, ...extra });
    }
  };
  const center = (text: string, extra: Partial<Extract<ReceiptLine, { kind: 'text' }>> = {}) =>
    push(text, { align: 'center', ...extra });
  const kv = (key: string, value: string, extra: Partial<Extract<ReceiptLine, { kind: 'text' }>> = {}) =>
    push(kvLine(key, value, width), extra);

  const currency = doc.currency === 'AOA' ? 'Kz' : doc.currency;
  const title = doc.doc_type === 'EXTRATO' ? 'EXTRATO DE CONTA' : 'PRÉ-CONTA';

  lines.push({ kind: 'feed', lines: 1 });
  center(title, { bold: true, double: true });
  if (doc.label) center(doc.label);
  lines.push({ kind: 'text', text: separator(width), align: 'left', bold: false, double: false });

  kv('Documento', doc.doc_number);
  kv('Emitida em', formatDateTime(doc.issued_at));
  if (doc.guest_name) kv(doc.context === 'QUARTO' ? 'Hóspede' : 'Cliente', doc.guest_name);
  if (doc.room_number) kv('Quarto', doc.room_number);
  kv('Emitido por', doc.issued_by_name ?? '—');

  lines.push({ kind: 'text', text: separator(width), align: 'left', bold: false, double: false });
  kv('Artigo', 'Valor', { bold: true });
  for (const line of doc.lines) {
    for (const row of itemLines(line.description, line.quantity, line.line_total, width)) {
      push(row);
    }
  }
  lines.push({ kind: 'text', text: separator(width), align: 'left', bold: false, double: false });

  kv('Subtotal', formatAmount(doc.subtotal) + ' ' + currency);
  if (doc.discount > 0) kv('Desconto', '- ' + formatAmount(doc.discount) + ' ' + currency);
  push(totalLine('Total', formatAmount(doc.total) + ' ' + currency, width), { bold: true });

  lines.push({ kind: 'text', text: separator(width), align: 'left', bold: false, double: false });
  center('Documento previo - sem valor fiscal');
  center('Código de verificação');
  lines.push({ kind: 'qr', text: `${doc.doc_number} ${formatAmount(doc.total)} ${doc.currency}` });
  lines.push({ kind: 'feed', lines: 2 });
  lines.push({ kind: 'cut' });

  return lines;
}

/* ── Construtores públicos ────────────────────────────────────────────────── */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** O mesmo layout, como texto puro — pré-visualização e partilha. */
export function buildPreBillText(doc: PreBillDoc, opts: { paper: PaperWidth }): string {
  const width = PAPER_COLUMNS[opts.paper];
  const out: string[] = [];
  for (const line of layoutPreBill(doc, opts)) {
    if (line.kind === 'text') {
      // O alinhamento é materializado aqui: o texto tem de caber exatamente
      // nas colunas do papel, tal como sai na impressora.
      if (line.align === 'center') out.push(centeredLine(line.text, width));
      else if (line.align === 'right') out.push(padLeft(line.text, width));
      else out.push(padRight(line.text, width));
    } else if (line.kind === 'qr') {
      // O texto não tem QR: descreve-se a carga útil, centrada como sairá.
      for (const chunk of wrapText(line.text, width)) out.push(centeredLine(chunk, width));
    } else if (line.kind === 'feed') {
      for (let i = 0; i < line.lines; i += 1) out.push('');
    }
    // O corte não tem representação em texto.
  }
  return out.join('\n');
}

/** O mesmo layout, como HTML de impressão (largura real do papel). */
export function buildPreBillHtml(doc: PreBillDoc, opts: { paper: PaperWidth }): string {
  const width = PAPER_COLUMNS[opts.paper];
  const sizePt = opts.paper === '58' ? 7.6 : 7.2;
  const body = layoutPreBill(doc, opts)
    .map(line => {
      if (line.kind === 'feed') return `<div class="feed">${'&nbsp;'.repeat(Math.max(1, line.lines))}</div>`;
      if (line.kind === 'cut') return '';
      if (line.kind === 'qr') {
        return `<div class="center qr">${escapeXml(line.text)}</div>`;
      }
      const classes = [
        line.align === 'center' ? 'center' : line.align === 'right' ? 'right' : 'left',
        line.bold ? 'bold' : '',
        line.double ? 'double' : '',
      ].join(' ');
      return `<div class="${classes}">${escapeXml(line.text)}</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${opts.paper}mm auto; margin: 3mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .receipt {
    font-family: 'Courier New', Courier, monospace;
    font-size: ${sizePt}pt;
    line-height: 1.25;
    color: #000;
    width: ${width}ch;
    white-space: pre;
  }
  .receipt div { white-space: pre; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .double { font-weight: bold; font-size: ${sizePt * 1.6}pt; }
  .qr { font-size: ${Math.max(5, sizePt - 1)}pt; word-break: break-all; white-space: normal; }
  .feed { height: ${sizePt * 0.6}pt; }
</style>
</head>
<body>
<div class="receipt">${body}</div>
</body>
</html>`;
}

/** Fluxo de bytes ESC/POS pronto a enviar à impressora. */
export function buildPreBillBytes(
  doc: PreBillDoc,
  opts: { paper: PaperWidth; encoding?: 'ASCII' | 'UTF8' },
): Uint8Array {
  const encoding = opts.encoding ?? 'ASCII';
  const out: number[] = [];

  out.push(...initBytes());
  out.push(...charsetBytes(0));

  for (const line of layoutPreBill(doc, opts)) {
    if (line.kind === 'cut') {
      out.push(...cutBytes('partial'));
      continue;
    }
    if (line.kind === 'feed') {
      out.push(...feedBytes(line.lines));
      continue;
    }
    if (line.kind === 'qr') {
      out.push(...qrBlock(line.text));
      continue;
    }

    const payload = encoding === 'UTF8' ? line.text : toPrinterText(line.text);
    out.push(...alignBytes(line.align));
    out.push(...boldBytes(line.bold));
    out.push(...sizeBytes(line.double, line.double));
    out.push(...utf8Bytes(payload));
    out.push(CR, LF);
    out.push(...boldBytes(false));
    out.push(...sizeBytes(false, false));
  }

  out.push(...alignBytes('left'));
  return Uint8Array.from(out);
}
