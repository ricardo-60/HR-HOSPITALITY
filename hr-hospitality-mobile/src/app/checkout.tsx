import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { createReservation, revalidateRoomQuote } from '@/lib/queries';
import { fetchBankAccounts, type BankAccount } from '@/lib/services';
import {
  captureFace,
  pickProofFile,
  uploadPaymentProof,
  uploadPublicMedia,
  validatePublicMedia,
  PUBLIC_MEDIA_LABELS,
  type CapturedFile,
  type PublicMediaKind,
} from '@/lib/upload';
import { sendReceiptToWhatsapp } from '@/lib/whatsapp';
import { useBooking } from '@/providers/BookingProvider';
import { draftTotal } from '@/types/hotel';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** UUID v4 — o Hermes não garante `crypto.randomUUID`. */
function makeOwnerId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = (Math.random() * 16) | 0;
    const digit = char === 'x' ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}

function fileSizeLabel(file: CapturedFile): string {
  if (file.sizeBytes === null) return file.mimeType;
  const mb = file.sizeBytes / 1048576;
  return `${mb < 1 ? `${Math.round(file.sizeBytes / 1024)} KB` : `${mb.toFixed(1)} MB`} · ${file.mimeType}`;
}

function prettyIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/** Uma peça do registo universal: mostra o que já foi capturado e permite repetir. */
function CaptureRow({
  label,
  hint,
  file,
  onCapture,
  secondaryLabel,
  onSecondary,
}: {
  label: string;
  hint: string;
  file: CapturedFile | null;
  onCapture: () => void;
  /** Acção alternativa (ex.: galeria) — paridade v0.2.1 com a Landing. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View className="rounded-2xl border border-white/10 bg-white/5 p-4 gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-white/45">{label}</Text>
          <Text className={`mt-1 text-xs ${file ? 'text-emerald-300' : 'text-white/40'}`}>
            {file ? `${file.name} · ${fileSizeLabel(file)}` : 'Por capturar — obrigatório'}
          </Text>
          <Text className="mt-1 text-[11px] leading-relaxed text-white/30">{hint}</Text>
        </View>
        <View
          className={`mt-0.5 h-2.5 w-2.5 rounded-full ${file ? 'bg-emerald-400' : 'bg-white/20'}`}
          accessibilityLabel={file ? 'Concluído' : 'Em falta'}
        />
      </View>
      {onSecondary && secondaryLabel ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" label={file ? 'Repetir captura' : label} variant="secondary" onPress={onCapture} />
          <Button className="flex-1" label={secondaryLabel} variant="secondary" onPress={onSecondary} />
        </View>
      ) : (
        <Button label={file ? 'Repetir captura' : label} variant="secondary" onPress={onCapture} />
      )}
    </View>
  );
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
  const { draft, guestName, email, notes, setGuestName, setEmail, setNotes, clearDraft, updateDraftUnitPrice } =
    useBooking();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  // Revalidação de tarifa junto do servidor: aviso quando o preço muda e
  // bloqueio quando o quarto deixa de estar DISPONIVEL no catálogo público.
  const [quoteNotice, setQuoteNotice] = useState<string | null>(null);
  const [roomGone, setRoomGone] = useState(false);

  const [signedIn, setSignedIn] = useState(false);
  const [proofFile, setProofFile] = useState<CapturedFile | null>(null);
  const [proofAmount, setProofAmount] = useState('');
  const [proofMethod, setProofMethod] = useState<'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA'>('MULTICAIXA_EXPRESS');
  const [proofReference, setProofReference] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofNotice, setProofNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Registo universal (migração 017): documento, comprovativo e rosto.
  const [docType, setDocType] = useState<'BI' | 'PASSAPORTE'>('BI');
  const [docNumber, setDocNumber] = useState('');
  const [docFile, setDocFile] = useState<CapturedFile | null>(null);
  const [faceFile, setFaceFile] = useState<CapturedFile | null>(null);
  /** Path do comprovativo já carregado com a reserva — evita subir duas vezes. */
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  const total = draft ? draftTotal(draft) : 0;
  const draftRoomId =
    draft?.serviceType === 'quarto' && draft.detail?.roomId ? String(draft.detail.roomId) : null;
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Revalidação em tempo real da tarifa: o total do rascunho foi capturado no
  // momento em que o hóspede abriu o quarto. Relemos aqui a tarifa vigente no
  // servidor (a RLS só devolve quartos DISPONIVEL): preço novo ⇒ total
  // recalculado com aviso; linha nula ⇒ o quarto saiu do catálogo e bloqueia-
  // se a submissão. Falha de rede ⇒ mantém-se o rascunho — a RPC revalida no
  // servidor e o watcher realtime já actualiza a lista em background.
  useEffect(() => {
    if (!draftRoomId) return;
    let cancelled = false;
    void revalidateRoomQuote(draftRoomId).then(result => {
      if (cancelled) return;
      if (!result.ok) {
        if (!result.error) setRoomGone(true);
        return;
      }
      const serverPrice = Number(result.room?.price_per_night) || 0;
      const current = draftRef.current;
      if (serverPrice > 0 && current && Math.abs(serverPrice - current.unitPrice) > 0.005) {
        updateDraftUnitPrice(serverPrice);
        setQuoteNotice('A tarifa do hotel foi actualizada. O total já mostra o valor vigente.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftRoomId, updateDraftUnitPrice]);

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

  /** Documento de identidade — imagem ou PDF do BI/passaporte. */
  const attachDoc = async () => {
    const picked = await pickProofFile();
    if (picked.cancelled) return;
    if (!picked.ok) { setError(picked.error); return; }
    setDocFile(picked.file);
  };

  /** Rosto — câmara da frente, com recorte quadrado no dispositivo. */
  const shootFace = async () => {
    const captured = await captureFace();
    if (captured.cancelled) return;
    if (!captured.ok) { setError(captured.error); return; }
    setFaceFile(captured.file);
  };

  /** Rosto — alternativa sem câmara: escolher da galeria (alimenta o mesmo `faceFile`). */
  const pickFace = async () => {
    const captured = await captureFace('library');
    if (captured.cancelled) return;
    if (!captured.ok) { setError(captured.error); return; }
    setFaceFile(captured.file);
  };

  /** Comprovativo — talão do Multicaixa Express ou extracto bancário. */
  const attachProof = async () => {
    const picked = await pickProofFile();
    if (picked.cancelled) return;
    if (!picked.ok) { setError(picked.error); return; }
    setProofFile(picked.file);
    setProofAmount(total.toFixed(2));
    // Pré-preenche a referência com o que já sabemos, para o hóspede só
    // confirmar no passo seguinte.
    if (!proofReference) setProofNotice('Comprovativo seleccionado. Toque em «Registar reserva».');
  };

  const submit = async () => {
    setError(null);
    if (!guestName.trim()) { setError('Indique o nome do hóspede.'); return; }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Indique um email válido — é por ele que a reserva é consultada.');
      return;
    }
    if (docNumber.trim().length < 3 || docNumber.trim().length > 32) {
      setError('O número do documento deve ter entre 3 e 32 caracteres.');
      return;
    }

    // Tarifa vigente — verificação final no servidor antes de pagar. Se o
    // preço mudou entretanto, actualiza o rascunho e pede nova confirmação
    // (o hóspede nunca submete um total desactualizado). Se o quarto saiu do
    // catálogo público, bloqueia-se. Falha de rede não bloqueia: a RPC
    // revalida tudo no servidor e o utilizador pode tentar de novo.
    if (draftRoomId) {
      const quote = await revalidateRoomQuote(draftRoomId);
      if (!quote.ok && !quote.error) {
        setRoomGone(true);
        setError('Este quarto deixou de estar disponível. Escolha outro na lista.');
        return;
      }
      if (quote.ok && quote.room) {
        const serverPrice = Number(quote.room.price_per_night) || 0;
        if (serverPrice > 0 && Math.abs(serverPrice - (draftRef.current?.unitPrice ?? -1)) > 0.005) {
          updateDraftUnitPrice(serverPrice);
          setQuoteNotice('A tarifa do hotel foi actualizada. Confirme o novo total e submeta outra vez.');
          setError('A tarifa foi actualizada pelo hotel. Confirme o novo total e submeta outra vez.');
          return;
        }
      }
    }

    // Os três ficheiros são obrigatórios (migração 017): valida-se tudo antes
    // de submeter para não deixar uploads a meio.
    for (const [kind, file] of [
      ['document', docFile],
      ['receipt', proofFile],
      ['face', faceFile],
    ] as [PublicMediaKind, CapturedFile | null][]) {
      const problem = validatePublicMedia(kind, file);
      if (problem) { setError(problem); return; }
    }

    setSubmitting(true);
    const ownerId = makeOwnerId();

    const paths: Record<PublicMediaKind, string> = { document: '', receipt: '', face: '' };
    for (const [kind, file] of [
      ['document', docFile!],
      ['receipt', proofFile!],
      ['face', faceFile!],
    ] as [PublicMediaKind, CapturedFile][]) {
      const uploaded = await uploadPublicMedia(kind, ownerId, file);
      if (!uploaded.ok) {
        setSubmitting(false);
        setError(`Falha no upload do ${PUBLIC_MEDIA_LABELS[kind].toLowerCase()}: ${uploaded.error}`);
        return;
      }
      paths[kind] = uploaded.path;
    }
    setReceiptPath(paths.receipt);

    const serviceType = draft?.serviceType ?? 'quarto';
    const result = await createReservation({
      guestName: guestName.trim(),
      email: email.trim(),
      serviceType,
      date: draft?.date ?? addDaysIso(new Date().toISOString().slice(0, 10), 0),
      totalAmount: total,
      notes,
      documentType: docType,
      documentNumber: docNumber,
      documentPath: paths.document,
      receiptPath: paths.receipt,
      facePath: paths.face,
      // A estadia de quarto é `preço por noite × noites`, logo a quantidade do
      // rascunho é o número de noites e define a data de saída.
      nights: serviceType === 'quarto' ? (draft?.quantity ?? 1) : undefined,
      // Ciclo v0.2.1: identifica o quarto escolhido para que a aprovação o
      // marque RESERVADO (e o cancelamento o liberte).
      roomId: serviceType === 'quarto' && draft?.detail?.roomId ? String(draft.detail.roomId) : undefined,
      roomNumber: serviceType === 'quarto' && draft?.detail?.roomNumber ? String(draft.detail.roomNumber) : undefined,
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setReference(result.reference);
    void loadAccounts();
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
            <Text className="font-bold text-white"> CONFIRMADA</Text> depois de validação da recepção.
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
        {quoteNotice ? (
          <Banner tone="info" message={quoteNotice} onClose={() => setQuoteNotice(null)} />
        ) : null}
        {roomGone ? (
          <Banner tone="error" message="Este quarto deixou de estar disponível. Volte à lista e escolha outro." />
        ) : null}
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

      <View className="gap-3">
        <SectionHeader
          title="Identificação"
          subtitle="Documento, comprovativo e rosto — obrigatórios"
        />

        <View className="flex-row gap-2">
          {(['BI', 'PASSAPORTE'] as const).map(option => (
            <Pressable
              key={option}
              onPress={() => setDocType(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: docType === option }}
              className={`flex-1 items-center rounded-2xl border px-4 py-3.5 ${
                docType === option ? 'border-aqua bg-aqua/10' : 'border-white/15 bg-white/5'
              }`}
            >
              <Text className={`text-xs font-bold ${docType === option ? 'text-aqua' : 'text-white/55'}`}>
                {option === 'BI' ? 'Bilhete de Identidade' : 'Passaporte'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          label="Número do documento"
          value={docNumber}
          onChangeText={setDocNumber}
          placeholder="Nº do BI ou passaporte"
        />

        <CaptureRow
          label={PUBLIC_MEDIA_LABELS.document}
          hint="Fotografe ou escolha o verso/primeira página (JPG, PNG, WEBP ou PDF · máx. 10 MB)."
          file={docFile}
          onCapture={() => void attachDoc()}
        />
        <CaptureRow
          label={PUBLIC_MEDIA_LABELS.receipt}
          hint="Talão do Multicaixa Express ou extracto da transferência (JPG, PNG, WEBP ou PDF · máx. 10 MB)."
          file={proofFile}
          onCapture={() => void attachProof()}
        />
        <CaptureRow
          label={PUBLIC_MEDIA_LABELS.face}
          hint="Usada pela recepção para o reconhecer à chegada (JPG, PNG ou WEBP · máx. 5 MB). Capture com a câmara ou escolha da galeria."
          file={faceFile}
          onCapture={() => void shootFace()}
          secondaryLabel="Escolher da galeria"
          onSecondary={() => void pickFace()}
        />
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
