import { Linking } from 'react-native';

import { HOTEL, HOTEL_IBAN, HOTEL_IBAN_HOLDER, isPlaceholderIban } from '@/constants/hotel';
import { formatKz } from '@/lib/format';
import { type BookingDraft, draftTotal } from '@/types/hotel';

export interface ReceiptPayload {
  reference: string;
  guestName: string;
  draft: BookingDraft;
}

/**
 * Normaliza para o formato do `wa.me`: apenas dígitos, com código de país.
 * `+244 900 000 000` → `244900000000`.
 */
export function whatsappNumber(raw: string = HOTEL.phone): string {
  return raw.replace(/[^\d]/g, '');
}

/**
 * Monta o comprovativo formatado que o hóspede envia por WhatsApp.
 *
 * O texto inclui sempre o IBAN, o valor e a referência, para que a recepção
 * consiga validar sem pedir informação adicional ao cliente.
 */
export function buildReceiptMessage(payload: ReceiptPayload): string {
  const { reference, guestName, draft } = payload;
  const total = draftTotal(draft);
  const lines = [
    '*HOTEL LUKWEKU — COMPROVATIVO DE RESERVA*',
    '',
    `*Referencia:* ${reference}`,
    `*Hospede:* ${guestName}`,
    `*Servico:* ${draft.title}`,
    `*Data:* ${draft.date}`,
    `*Quantidade:* ${draft.quantity}`,
    '',
    `*Valor a pagar:* ${formatKz(total)}`,
    `*IBAN:* ${HOTEL_IBAN}`,
    `*Titular:* ${HOTEL_IBAN_HOLDER}`,
    '',
    draft.notes?.trim() ? `*Observacoes:* ${draft.notes.trim()}` : null,
    '',
    'Aguardo confirmacao da recepcao.',
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}

export function buildWhatsappUrl(payload: ReceiptPayload, rawNumber: string = HOTEL.phone): string {
  const text = encodeURIComponent(buildReceiptMessage(payload));
  return `https://wa.me/${whatsappNumber(rawNumber)}?text=${text}`;
}

export interface WhatsappResult {
  ok: boolean;
  /** Motivo da recusa, pronto a mostrar ao utilizador. */
  reason?: string;
}

/**
 * Abre o WhatsApp com o comprovativo.
 *
 * Recusa enviar quando o IBAN continua a ser o placeholder: nesse caso o
 * hóspede receberia instruções para pagar uma conta que não existe.
 */
export async function sendReceiptToWhatsapp(
  payload: ReceiptPayload,
  rawNumber: string = HOTEL.phone,
): Promise<WhatsappResult> {
  if (isPlaceholderIban()) {
    return {
      ok: false,
      reason:
        'O IBAN do hotel ainda não foi configurado. A recepção não pode receber este comprovativo.',
    };
  }

  const url = buildWhatsappUrl(payload, rawNumber);
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      return { ok: false, reason: 'Não foi possível abrir o WhatsApp neste dispositivo.' };
    }
    await Linking.openURL(url);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Falha ao abrir o WhatsApp. Tente novamente.' };
  }
}
