/**
 * Declaração mínima para o pacote `qrcode` (node-qrcode 1.5.4).
 *
 * O pacote não distribui tipos (`@types/qrcode` não existe), por isso
 * declaramos aqui apenas a superfície usada pelo painel: `toString` com
 * opções do renderer SVG, que devolve uma `Promise<string>` com a marca
 * `<svg ...>`.
 */
declare module 'qrcode' {
  export interface QRCodeToStringOptions {
    /** Formato de saída — o painel usa apenas 'svg'. */
    type?: 'svg' | 'utf8' | 'terminal';
    /** Margem (em módulos) em redor do código. */
    margin?: number;
    /** Largura/altura em px da marca SVG. */
    width?: number;
    /** Nível de correção de erros. */
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: {
      dark?: string;
      light?: string;
    };
  }

  export function toString(
    text: string,
    options?: QRCodeToStringOptions
  ): Promise<string>;

  const QRCode: {
    toString: typeof toString;
  };

  export default QRCode;
}
