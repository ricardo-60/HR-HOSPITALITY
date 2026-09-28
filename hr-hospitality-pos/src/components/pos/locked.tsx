import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { formatKz } from '@/lib/format';
import type { PosOrderItem } from '@/types/pos';

/** Justificação mínima, imposta também pelo trigger da base de dados. */
const MIN_JUSTIFICATION = 8;

/**
 * Remoção auditada de um item já emitido em pré-conta.
 *
 * O operador tem de escrever a justificação ANTES de apagar: é ela que o
 * UPDATE `removal_justification` leva para a base de dados e sem ela o
 * trigger `protect_locked_order_items` recusa o DELETE com 42501.
 *
 * O campo começa sempre limpo porque o ecrã monta o modal com `key` igual ao
 * id do item — cada remoção é uma montagem nova, sem efeitos de reset.
 */
export function RemoveLockedModal({
  item,
  busy = false,
  onCancel,
  onConfirm,
}: {
  item: PosOrderItem | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}) {
  const [text, setText] = useState('');

  if (!item) return null;

  const trimmed = text.trim();
  const missing = trimmed.length < MIN_JUSTIFICATION;
  const missingChars = Math.max(0, MIN_JUSTIFICATION - trimmed.length);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/75 p-4">
        <View className="w-full max-w-[520px] gap-3 rounded-3xl border border-amber-400/40 bg-ink p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Text className="text-base font-black text-amber-300">🔒</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-black text-white">Item de pré-conta bloqueado</Text>
              <Text className="text-[11px] text-white/45">
                {item.product_name} · {formatKz(item.line_total)}
              </Text>
            </View>
            <Pressable
              onPress={onCancel}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancelar remoção"
              className="h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5"
            >
              <Text className="text-sm font-black text-white">✕</Text>
            </Pressable>
          </View>

          <Text className="text-xs leading-relaxed text-white/60">
            Este artigo já saiu impresso numa pré-conta e está congelado. A remoção só passa com
            justificação escrita, que fica registada na auditoria da instância com o seu nome, a hora
            e o motivo.
          </Text>

          <Field
            label={`Justificação (mínimo ${MIN_JUSTIFICATION} caracteres)`}
            value={text}
            onChangeText={setText}
            placeholder="Ex.: cliente errou o artigo"
          />

          {text.length > 0 && missing ? (
            <Text className="text-[11px] font-semibold text-amber-300">
              Faltam {missingChars} caractere{missingChars === 1 ? '' : 's'} para a justificação ser aceite.
            </Text>
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            <Button
              label="Remover item"
              variant="danger"
              loading={busy}
              disabled={missing}
              onPress={() => onConfirm(trimmed)}
              className="min-w-[160px] flex-1"
            />
            <Button
              label="Cancelar"
              variant="secondary"
              disabled={busy}
              onPress={onCancel}
              className="min-w-[160px] flex-1"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
