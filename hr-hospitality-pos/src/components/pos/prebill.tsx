import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Banner, Button } from '@/components/ui';
import { buildPreBillText } from '@/lib/escpos';
import { formatDateTime, formatKz } from '@/lib/format';
import { paperFor, printReceipt, shareReceipt } from '@/lib/printing';
import { PRINTER_LABEL, type PreBillDoc } from '@/types/pos';

const MONO = { fontFamily: 'monospace' } as const;

/**
 * Pré-visualização da pré-conta congelada.
 *
 * O documento que se vê aqui é a fotografia devolvida pela RPC — já não muda
 * mais, mesmo que a comanda seja depois alterada. Daqui se imprime (diálogo de
 * impressão do sistema, com a impressora térmica Bluetooth exposta como
 * serviço) e se partilha.
 *
 * O ecrã monta o modal com `key` igual ao número do documento, pelo que cada
 * emissão começa com mensagens e estados limpos, sem efeitos de reset.
 */
export function PreBillModal({ doc, onClose }: { doc: PreBillDoc | null; onClose: () => void }) {
  const [busy, setBusy] = useState<'print' | 'share' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!doc) return null;

  const paper = paperFor(doc.printer);
  const text = buildPreBillText(doc, { paper });

  const run = async (action: 'print' | 'share') => {
    setBusy(action);
    setErrorMessage(null);
    setMessage(null);
    const result = action === 'print' ? await printReceipt(doc, paper) : await shareReceipt(doc, paper);
    setBusy(null);
    if (!result.ok) setErrorMessage(result.error);
    else if (action === 'print') setMessage('Documento enviado para impressão.');
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/75 p-4">
        <View className="w-full max-w-[560px] gap-3 rounded-3xl border border-gold/30 bg-ink p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-black text-white">
                {doc.doc_type === 'EXTRATO' ? 'Extrato' : 'Pré-conta'} {doc.doc_number}
              </Text>
              <Text className="mt-0.5 text-[11px] text-white/45">
                {doc.label ?? 'Comanda'} · {formatDateTime(doc.issued_at)} · {PRINTER_LABEL[doc.printer]}
              </Text>
            </View>
            <Pressable
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fechar pré-conta"
              className="h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5"
            >
              <Text className="text-sm font-black text-white">✕</Text>
            </Pressable>
          </View>

          {errorMessage ? (
            <Banner tone="error" message={errorMessage} onClose={() => setErrorMessage(null)} />
          ) : null}
          {message ? <Banner tone="success" message={message} /> : null}

          <ScrollView
            className="max-h-[360px] rounded-2xl border border-white/10 bg-ocean-dark p-3"
            contentContainerClassName="gap-0.5"
          >
            <Text style={MONO} className="text-[11px] leading-4 text-white/75">{text}</Text>
          </ScrollView>

          <Text className="text-[11px] text-white/40">
            {doc.line_count} artigo{doc.line_count === 1 ? '' : 's'} · Total {formatKz(doc.total)} · emitido por{' '}
            {doc.issued_by_name ?? '—'}
            {doc.locked_items > 0 ? ` · ${doc.locked_items} item(ns) bloqueados` : ''}
          </Text>

          <View className="flex-row flex-wrap gap-2">
            <Button
              label="Imprimir"
              loading={busy === 'print'}
              disabled={busy !== null}
              onPress={() => void run('print')}
              className="min-w-[140px] flex-1"
            />
            <Button
              label="Partilhar"
              variant="secondary"
              loading={busy === 'share'}
              disabled={busy !== null}
              onPress={() => void run('share')}
              className="min-w-[140px] flex-1"
            />
            <Button label="Fechar" variant="secondary" disabled={busy !== null} onPress={close} className="min-w-[140px] flex-1" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
