import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, EmptyState, Field, Loading, Screen, SectionHeader } from '@/components/ui';
import {
  HOTEL_IBAN,
  HOTEL_IBAN_HOLDER,
  PAYMENT_INSTRUCTIONS,
  isPlaceholderIban,
} from '@/constants/hotel';
import { currentAccount } from '@/lib/guestAuth';
import { addDaysIso, formatDay, formatKz } from '@/lib/format';
import { createReservation } from '@/lib/queries';
import { fetchBankAccounts, type BankAccount } from '@/lib/services';
import { pickProofFile, uploadPaymentProof, type CapturedFile } from '@/lib/upload';
import { sendReceiptToWhatsapp } from '@/lib/whatsapp';
import { useBooking } from '@/providers/BookingProvider';
import { draftTotal } from '@/types/hotel';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function prettyIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Checkout com pagamento por transferência bancária.
 *
 * Os IBANs não estão codificados no ficheiro: vêm de `tenant_bank_accounts`,
 * configurados pelo hotel no painel administrativo. A app mostra a conta
 * principal primeiro, permite copiar o IBAN para a área de transferência do
 * telemóvel e recebe o comprovativo do Multicaixa Express.
 */
export default function CheckoutScreen() {
  const router = useRouter();
  const { draft, guestName, email, notes, setGuestName, setEmail, setNotes, clearDraft } = useBooking();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const [signedIn, setSignedIn] = useState(false);
  const [proofFile, setProofFile] = useState<CapturedFile | null>(null);
  const [proofAmount, setProofAmount] = useState('');
  const [proofMethod, setProofMethod] = useState<'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA'>('MULTICAIXA_EXPRESS');
  const [proofReference, setProofReference] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofNotice, setProofNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const total = draft ? draftTotal(draft) : 0;

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const result = await fetchBankAccounts();
    setAccounts(result.data);
    setAccountsError(result.error);
    setSelectedId(current => {
      if (current && result.data.some(account => account.id === current)) return current;
      const primary = result.data.find(account => account.is_primary);
      return primary?.id ?? result.data[0]?.id ?? null;
    });
    setLoadingAccounts(false);
  }, []);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadAccounts().finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
      void currentAccount().then(account => {
        if (!cancelled) setSignedIn(account !== null);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, loadAccounts]);

  const selected = accounts.find(account => account.id === selectedId) ?? null;

  const copyIban = async () => {
    if (!selected) return;
    await Clipboard.setStringAsync(selected.iban.replace(/\s+/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const submit = async () => {
    setError(null);
    if (!guestName.trim()) { setError('Indique o nome do hóspede.'); return; }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Indique um email válido — é por ele que a reserva é consultada.');
      return;
    }

    setSubmitting(true);
    const result = await createReservation({
      guestName: guestName.trim(),
      email: email.trim(),
      serviceType: draft?.serviceType ?? 'quarto',
      date: draft?.date ?? addDaysIso(new Date().toISOString().slice(0, 10), 0),
      totalAmount: total,
      notes,
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setReference(result.reference);
    void loadAccounts();
  };

  const attachProof = async () => {
    if (!reference) return;
    const picked = await pickProofFile();
    if (picked.cancelled) return;
    if (!picked.ok) { setError(picked.error); return; }
    setProofFile(picked.file);
    setProofAmount(total.toFixed(2));
    setProofNotice('Comprovativo seleccionado. Toque em enviar.');
  };

  const sendProof = async () => {
    if (!reference || !proofFile || !selected) return;
    setUploadingProof(true);
    setError(null);
    setProofNotice(null);
    const result = await uploadPaymentProof({
      reservationId: reference,
      bankAccountId: selected.id,
      amount: Number.parseFloat(proofAmount) || 0,
      method: proofMethod,
      paymentReference: proofReference,
      file: proofFile,
    });
    setUploadingProof(false);
    if (!result.ok) { setError(result.error); return; }
    setProofNotice('Comprovativo enviado. A recepção vai validar e confirmar a reserva.');
  };

  const share = async () => {
    if (!reference || !draft) return;
    const result = await sendReceiptToWhatsapp({ reference, guestName, draft });
    if (!result.ok) Alert.alert('Não foi possível enviar', result.reason);
  };

  if (!draft) {
    return (
      <Screen>
        <EmptyState
          title="Nenhuma reserva em curso"
          hint="Escolha um quarto, piscina ou serviço para começar."
        />
        <Button label="Ver alojamento" onPress={() => router.replace('/alojamento')} variant="secondary" />
      </Screen>
    );
  }

  const ibanReady = !isPlaceholderIban() || selected !== null;

  /* ── Reservado: falta enviar o comprovativo ── */
  if (reference) {
    return (
      <Screen>
        <Card className="gap-3 border-emerald-400/30 bg-emerald-500/10">
          <Text className="text-xs font-bold uppercase tracking-wider text-emerald-300">Reserva registada</Text>
          <Text className="text-3xl font-black text-white">{reference}</Text>
          <Text className="text-sm text-white/70">
            Agora faça a transferência e envie o comprovativo. A reserva passa a
            <span className="text-white"> CONFIRMADA</span> depois de validação da recepção.
          </Text>
        </Card>

        <Card className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-white/45">Valor a pagar</Text>
            <Text className="text-xl font-black text-gold">{formatKz(total)}</Text>
          </View>
          {selected ? (
            <>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-white/45">
                {selected.bank_name}
              </Text>
              <Text className="font-mono text-base font-bold text-gold">{prettyIban(selected.iban)}</Text>
              <Text className="text-[11px] text-white/40">{selected.account_holder}</Text>
            </>
          ) : (
            <>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-white/45">IBAN</Text>
              <Text className="font-mono text-base font-bold text-gold">{HOTEL_IBAN}</Text>
              <Text className="text-[11px] text-white/40">{HOTEL_IBAN_HOLDER}</Text>
            </>
          )}
        </Card>

        <Button label={copied ? 'IBAN copiado' : 'Copiar IBAN'} onPress={() => void copyIban()} disabled={!selected} />
        <Button label="Enviar comprovativo por WhatsApp" onPress={() => void share()} variant="secondary" />

        {error ? <Banner tone="error" message={error} /> : null}
        {proofNotice ? <Banner tone="success" message={proofNotice} /> : null}

        <View className="gap-3">
          <SectionHeader title="Comprovativo Multicaixa Express" />
          {!signedIn ? (
            <Card className="gap-2">
              <Text className="text-sm leading-relaxed text-white/65">
                Para enviar o comprovativo tem de ter conta. Crie a conta no ecrã de documentos e
                volte a este passo.
              </Text>
              <Button label="Ir para os documentos" variant="secondary" onPress={() => router.push('/kyc')} />
            </Card>
          ) : (
            <>
              <View className="flex-row gap-2">
                {(['MULTICAIXA_EXPRESS', 'TRANSFERENCIA'] as const).map(option => (
                  <Pressable
                    key={option}
                    onPress={() => setProofMethod(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: proofMethod === option }}
                    className={`flex-1 items-center rounded-2xl border px-4 py-3.5 ${
                      proofMethod === option ? 'border-aqua bg-aqua/10' : 'border-white/15 bg-white/5'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${proofMethod === option ? 'text-aqua' : 'text-white/55'}`}>
                      {option === 'MULTICAIXA_EXPRESS' ? 'Multicaixa Express' : 'Transferência'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Button label={proofFile ? 'Trocar ficheiro' : 'Escolher comprovativo'} variant="secondary" onPress={() => void attachProof()} />
              {proofFile ? (
                <Card className="gap-2">
                  <Text className="text-xs text-white/60">
                    {proofFile.name} · {proofFile.mimeType}
                  </Text>
                  <Field label="Valor transferido" value={proofAmount} onChangeText={setProofAmount} keyboardType="decimal-pad" autoCapitalize="none" />
                  <Field
                    label="Referência / nº da operação"
                    value={proofReference}
                    onChangeText={setProofReference}
                    placeholder="Referência mostrada no comprovativo"
                    autoCapitalize="none"
                  />
                  <Button label="Enviar comprovativo" loading={uploadingProof} onPress={() => void sendProof()} />
                </Card>
              ) : null}
            </>
          )}
        </View>

        <Button
          label="Voltar ao início"
          variant="secondary"
          onPress={() => {
            clearDraft();
            router.replace('/');
          }}
        />
      </Screen>
    );
  }

  /* ── Formulário ── */
  return (
    <Screen>
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Confirmar reserva</Text>
        <Text className="text-sm text-white/50">Preencha os dados e pague por transferência.</Text>
      </View>

      <Card className="gap-2">
        <Text className="text-sm font-bold text-white">{draft.title}</Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-white/55">{formatDay(draft.date)}</Text>
          <Text className="text-sm text-white/55">× {draft.quantity}</Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between border-t border-white/10 pt-3">
          <Text className="text-sm font-bold text-white">Total</Text>
          <Text className="text-xl font-black text-gold">{formatKz(total)}</Text>
        </View>
      </Card>

      <View className="gap-3">
        <SectionHeader title="Dados do hóspede" />
        <Field label="Nome completo" value={guestName} onChangeText={setGuestName} placeholder="Nome do hóspede" autoCapitalize="words" />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="email@exemplo.ao" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Observações (opcional)" value={notes} onChangeText={setNotes} placeholder="Hora preferida, mobiliário…" multiline />
      </View>

      {error ? (
        <Card className="border-rose-400/30 bg-rose-500/10">
          <Text className="text-sm text-rose-200">{error}</Text>
        </Card>
      ) : null}

      <Button label="Registar reserva" onPress={() => void submit()} loading={submitting} />

      <View className="gap-3">
        <SectionHeader title="Pague por transferência" subtitle="IBANs configurados pelo hotel" />

        {loadingAccounts ? (
          <Loading label="A carregar os IBANs…" />
        ) : accountsError && accounts.length === 0 ? (
          <Card className="gap-2">
            <Text className="text-sm text-white/60">{accountsError}</Text>
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="gap-2">
            <Text className="text-sm leading-relaxed text-white/60">
              O hotel ainda não configurou nenhum IBAN activo. Contacte a recepção para concluir a
              reserva.
            </Text>
          </Card>
        ) : (
          <>
            {accounts.map(account => {
              const active = account.id === selectedId;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => setSelectedId(account.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  className={`rounded-3xl border p-4 ${
                    active ? 'border-gold bg-gold/10' : 'border-white/10 bg-ink'
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-white">{account.bank_name}</Text>
                      <Text className="font-mono text-sm font-bold text-gold mt-1.5">
                        {prettyIban(account.iban)}
                      </Text>
                      <Text className="text-[11px] text-white/40 mt-1">{account.account_holder}</Text>
                    </View>
                    {account.is_primary ? <Badge label="Principal" tone="accent" /> : null}
                  </View>
                  {active && account.instructions ? (
                    <Text className="mt-2 text-[11px] leading-relaxed text-white/50">{account.instructions}</Text>
                  ) : null}
                </Pressable>
              );
            })}

            <Button
              label={copied ? 'IBAN copiado' : 'Copiar IBAN'}
              onPress={() => void copyIban()}
              disabled={!selected}
            />
            <Text className="text-center text-[11px] text-white/35">
              Cole o IBAN na app do seu banco ou no Multicaixa Express.
            </Text>
          </>
        )}

        {!ibanReady ? (
          <Card className="border-gold/30 bg-gold/10">
            <Text className="text-sm text-gold">
              O hotel ainda não configurou IBAN. Esta app não apresenta instruções de pagamento até
              haver uma conta activa.
            </Text>
          </Card>
        ) : null}

        <Card className="gap-2">
          {PAYMENT_INSTRUCTIONS.map((line, index) => (
            <Text key={index} className="text-sm leading-relaxed text-white/65">{line}</Text>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openURL('https://wa.me/244900000000')}
            className="pt-1"
          >
            <Text className="text-xs font-bold text-aqua">Dúvidas? Falar com a recepção no WhatsApp</Text>
          </Pressable>
        </Card>
      </View>
    </Screen>
  );
}
