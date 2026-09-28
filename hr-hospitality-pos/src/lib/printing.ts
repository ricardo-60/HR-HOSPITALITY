/**
 * Impressão e partilha de pré-contas — apenas módulos oficiais do Expo.
 *
 * `expo-print` renderiza o HTML à largura real do papel (58 mm ou 80 mm) e
 * entrega-o ao serviço de impressão do sistema: no Android é assim que uma
 * impressora térmica Bluetooth pareada aparece como destino do diálogo de
 * impressão. `expo-sharing` leva o PDF gerado para qualquer app; quando não há
 * partilha de ficheiros, cai para a partilha de texto nativa do React Native.
 *
 * Todos os caminhos apanham a própria indisponibilidade do módulo — a app
 * nunca rebenta por a impressão não existir no dispositivo.
 */

import { buildPreBillHtml, buildPreBillText, type PaperWidth } from '@/lib/escpos';
import type { Result } from '@/lib/posApi';
import type { PreBillDoc, PreBillPrinter } from '@/types/pos';

/** Largura de papel a usar num documento, a partir da impressora escolhida. */
export function paperFor(printer: PreBillPrinter): PaperWidth {
  return printer === 'ESCPOS_58' ? '58' : '80';
}

function friendly(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return message ? `${fallback} (${message})` : fallback;
}

/** Abre o diálogo de impressão do sistema com o recibo à largura do papel. */
export async function printReceipt(doc: PreBillDoc, paper: PaperWidth): Promise<Result<null>> {
  try {
    const print = await import('expo-print');
    await print.printAsync({ html: buildPreBillHtml(doc, { paper }) });
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: friendly(error, 'Impressão indisponível neste dispositivo.') };
  }
}

/**
 * Partilha o documento: PDF escrito pelo `expo-print` e entregue pelo
 * `expo-sharing`; sem partilha de ficheiros, o texto plano do recibo.
 */
export async function shareReceipt(doc: PreBillDoc, paper: PaperWidth): Promise<Result<null>> {
  const title = `Pré-conta ${doc.doc_number}`;
  const text = buildPreBillText(doc, { paper });

  try {
    const print = await import('expo-print');
    const sharing = await import('expo-sharing');
    if (await sharing.isAvailableAsync()) {
      const file = await print.printToFileAsync({ html: buildPreBillHtml(doc, { paper }) });
      await sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: title,
        UTI: 'com.adobe.pdf',
      });
      return { ok: true, data: null };
    }
  } catch {
    // Sem PDF ou sem sharing: a partilha de texto continua a servir.
  }

  try {
    const { Share } = await import('react-native');
    await Share.share({ message: text, title });
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, data: null, error: friendly(error, 'Partilha indisponível neste dispositivo.') };
  }
}
