import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Banner, Button, Card, EmptyState, Loading, Screen, SectionHeader } from '@/components/ui';
import { formatClock, formatDay, formatKz, formatQuantity } from '@/lib/format';
import {
  ACCOUNT_SOURCE_LABEL,
  DOC_TYPE_LABEL,
  GUEST_ACCOUNT_STATUS_LABEL,
  GUEST_ACCOUNT_STATUS_TONE,
  ORDER_ORIGIN_LABEL,
  PRINTER_LABEL,
  fetchGuestStatement,
  watchStatement,
  type GuestAccountRow,
  type GuestOrderItemRow,
  type GuestStatementResult,
  type PreBillLogRow,
} from '@/lib/guestLedger';

const UNAVAILABLE_TITLE = 'O extrato estará disponível assim que a unidade activar esta função';
const UNAVAILABLE_HINT =
  'Enquanto isso pode continuar a usar reservas, serviços e preços da aplicação com normalidade.';

/* ── Peças de UI ───────────────────────────────────────────────────────── */

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</Text>
      <Text className="text-xs font-semibold text-white/85">{value}</Text>
    </View>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-2">
      <Text className={strong ? 'text-sm font-bold text-white' : 'text-sm text-white/55'}>{label}</Text>
      <Text
        className={strong ? 'text-lg font-black text-gold' : 'text-right text-sm font-semibold text-white'}
      >
        {value}
      </Text>
    </View>
  );
}

function AccountCard({ account }: { account: GuestAccountRow }) {
  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[11px] uppercase tracking-wider text-white/45">
            Conta {account.account_number}
          </Text>
          <Text className="text-lg font-black text-white">{account.guest_name}</Text>
        </View>
        <Badge
          label={GUEST_ACCOUNT_STATUS_LABEL[account.status] ?? account.status}
          tone={GUEST_ACCOUNT_STATUS_TONE[account.status] ?? 'muted'}
        />
      </View>
      <View className="flex-row flex-wrap gap-x-5 gap-y-2">
        <Meta label="Quarto" value={account.room_number?.trim() || '—'} />
        <Meta label="Origem" value={ACCOUNT_SOURCE_LABEL[account.source] ?? account.source} />
        <Meta label="Moeda" value={account.currency || 'AOA'} />
        <Meta
          label="Aberta em"
          value={`${formatDay(account.opened_at)} · ${formatClock(account.opened_at)}`}
        />
      </View>
    </Card>
  );
}

/** Uma linha do extrato: descrição, origem, hora, quantidade e valor. */
function LineRow({ item }: { item: GuestOrderItemRow }) {
  const discount = Number(item.discount ?? 0);
  const details = [
    ORDER_ORIGIN_LABEL[item.origin] ?? item.origin,
    formatClock(item.consumed_at),
    `${formatQuantity(item.quantity)} × ${formatKz(item.unit_price)}`,
    Number.isFinite(discount) && discount > 0 ? `desconto ${formatKz(discount)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-1 py-2.5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm font-semibold text-white">{item.description}</Text>
        <Text className="text-sm font-bold text-gold">{formatKz(item.line_total)}</Text>
      </View>
      <Text className="text-[11px] leading-relaxed text-white/45">{details}</Text>
    </View>
  );
}

/** Comprovativo congelado (só leitura) de um documento já emitido. */
function StatementDocument({ doc, onClose }: { doc: PreBillLogRow; onClose: () => void }) {
  const payload = doc.payload ?? {};
  const lines = payload.lines ?? [];
  const currencyCode = payload.currency ?? doc.currency;
  const currency = !currencyCode || currencyCode === 'AOA' ? 'Kz' : currencyCode;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-ocean-dark">
        <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-[11px] uppercase tracking-wider text-white/45">Comprovativo</Text>
              <Text className="text-xl font-black text-white">{doc.doc_number}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar comprovativo"
              hitSlop={10}
              onPress={onClose}
            >
              <Text className="text-lg font-black text-white/60">✕</Text>
            </Pressable>
          </View>

          <Card className="gap-1 divide-y divide-white/5">
            <TotalRow label="Documento" value={DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type} />
            {payload.label ? <TotalRow label="Referência" value={payload.label} /> : null}
            <TotalRow label="Hóspede" value={payload.guest_name ?? doc.guest_name ?? '—'} />
            <TotalRow label="Quarto" value={payload.room_number ?? doc.room_number ?? '—'} />
            <TotalRow
              label="Emitido em"
              value={`${formatDay(doc.created_at)} · ${formatClock(doc.created_at)}`}
            />
            <TotalRow label="Impressora" value={PRINTER_LABEL[doc.printer] ?? doc.printer} />
            <TotalRow label="Emitido por" value={payload.issued_by_name ?? 'Recepção'} />
          </Card>

          <View className="gap-2">
            <SectionHeader
              title="Linhas do documento"
              subtitle={`${lines.length} ${lines.length === 1 ? 'linha' : 'linhas'} congeladas`}
            />
            <Card className="divide-y divide-white/5">
              {lines.length === 0 ? (
                <Text className="py-3 text-xs text-white/45">
                  Este documento não guarda linhas legíveis — peça cópia na recepção.
                </Text>
              ) : (
                lines.map((line, index) => (
                  // As linhas congeladas não têm id: combina-se o documento
                  // com a posição para uma chave estável e única.
                  <View key={`${doc.id}-${index}`} className="gap-0.5 py-2.5">
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="flex-1 text-sm font-semibold text-white">{line.description}</Text>
                      <Text className="text-sm font-bold text-white">{formatKz(line.line_total)}</Text>
                    </View>
                    <Text className="text-[11px] text-white/45">
                      {formatQuantity(line.quantity)} × {formatKz(line.unit_price)}
                    </Text>
                  </View>
                ))
              )}
            </Card>
          </View>

          <Card className="gap-1 divide-y divide-white/5">
            <TotalRow label="Subtotal" value={formatKz(payload.subtotal ?? doc.subtotal)} />
            <TotalRow label="Descontos" value={formatKz(payload.discount ?? doc.discount)} />
            <TotalRow label="Total" value={formatKz(payload.total ?? doc.total)} strong />
          </Card>

          <Text className="text-center text-[11px] leading-relaxed text-white/35">
            Documento congelado no momento da emissão — apenas leitura. Valores em {currency}.
          </Text>

          <Button label="Fechar" variant="secondary" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Extrato transparente do hóspede.
 *
 * Mostra a conta em aberto, cada lançamento agrupado por dia, os totais
 * lidos directamente de `guest_accounts` e os documentos já emitidos. Tudo
 * em modo leitura: a app nunca escreve nestas tabelas, e o `total` da conta
 * é calculado pela própria base de dados.
 *
 * Sem a migração 011 aplicada, o ecrã degrada para um estado vazio amigável
 * — nunca quebra a navegação nem as restantes ecrãs.
 */
export default function StatementScreen() {
  const router = useRouter();

  const [result, setResult] = useState<GuestStatementResult | null>(null);
  const [pulling, setPulling] = useState(false);
  const [openDoc, setOpenDoc] = useState<PreBillLogRow | null>(null);

  const reload = useCallback(async () => {
    const next = await fetchGuestStatement();
    setResult(next);
    setPulling(false);
  }, []);

  const onRefresh = useCallback(() => {
    setPulling(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    // Arranque adiado para o primeiro paint, como nos restantes ecrãs
    // autenticados: a carga nunca bloqueia a abertura do ecrã.
    const timer = setTimeout(() => {
      void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  // Realtime: um novo consumo (ou o recálculo do total) chega sem reload.
  const accountId =
    result?.kind === 'ready' ? (result.statement.account?.id ?? null) : null;

  useEffect(() => {
    if (!accountId) return;
    return watchStatement(accountId, reload);
  }, [accountId, reload]);

  const dayGroups = useMemo(() => {
    if (result?.kind !== 'ready') return [];
    const byDay = new Map<string, GuestOrderItemRow[]>();
    for (const item of result.statement.items) {
      const day = item.consumed_at.slice(0, 10);
      const bucket = byDay.get(day);
      if (bucket) bucket.push(item);
      else byDay.set(day, [item]);
    }
    return Array.from(byDay, ([day, items]) => ({ day, items }));
  }, [result]);

  const statement = result?.kind === 'ready' ? result.statement : null;
  const account = statement?.account ?? null;
  const docsUnavailable = result?.kind === 'ready' ? result.docsUnavailable : false;

  const refreshControl = (
    <RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor="#FBBF24" />
  );

  let body = <Loading label="A carregar o extrato…" />;

  if (result?.kind === 'signed-out') {
    body = (
      <>
        <EmptyState
          title="Entre para consultar o seu extrato"
          hint="O extrato é privado e mostra apenas as contas ligadas à sua sessão."
        />
        <Button label="Entrar ou criar conta" onPress={() => router.push('/kyc')} />
      </>
    );
  } else if (result?.kind === 'unavailable') {
    body = (
      <>
        <EmptyState title={UNAVAILABLE_TITLE} hint={UNAVAILABLE_HINT} />
        <Text className="text-center text-[11px] text-white/30">{result.reason}</Text>
        <Button label="Actualizar" variant="secondary" onPress={() => void reload()} />
      </>
    );
  } else if (result?.kind === 'error') {
    body = (
      <>
        <Banner tone="error" message="Não foi possível carregar o extrato." />
        <Text className="text-center text-[11px] text-white/35">{result.reason}</Text>
        <Button label="Tentar de novo" variant="secondary" onPress={() => void reload()} />
      </>
    );
  } else if (result?.kind === 'ready' && !account) {
    body = (
      <>
        <EmptyState
          title="Ainda não tem uma conta aberta"
          hint="Depois do check-in na recepção, cada consumo passa a aparecer aqui — com hora, quantidade e valor."
        />
        <Button label="Fazer check-in digital" variant="secondary" onPress={() => router.push('/kyc')} />
      </>
    );
  } else if (result?.kind === 'ready' && account && statement) {
    const docs = statement.docs;
    const lineCount = statement.items.length;

    body = (
      <>
        <AccountCard account={account} />

        <Card className="gap-1 divide-y divide-white/5">
          <TotalRow label="Subtotal" value={formatKz(account.subtotal)} />
          <TotalRow label="Descontos" value={formatKz(account.discount)} />
          <TotalRow label="Total" value={formatKz(account.total)} strong />
        </Card>
        <Text className="text-[11px] leading-relaxed text-white/40">
          {lineCount} {lineCount === 1 ? 'lançamento' : 'lançamentos'} · o total é somado
          automaticamente pela base de dados, nunca editado.
          {account.pre_billed_at
            ? ` Extrato emitido a ${formatDay(account.pre_billed_at)} · ${formatClock(account.pre_billed_at)}.`
            : ''}
        </Text>

        <View className="gap-3">
          <SectionHeader
            title="Movimentação"
            subtitle="Cada linha, agrupada por dia"
            action={
              <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                Em tempo real
              </Text>
            }
          />
          {lineCount === 0 ? (
            <EmptyState
              title="Ainda não há consumos registados"
              hint="Assim que consumir um serviço, a linha aparece aqui sem precisar de recarregar."
            />
          ) : (
            dayGroups.map(group => (
              <View key={group.day} className="gap-2">
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-gold/85">
                    {formatDay(group.day)}
                  </Text>
                  <Text className="text-[11px] text-white/40">
                    {group.items.length} {group.items.length === 1 ? 'lançamento' : 'lançamentos'}
                  </Text>
                </View>
                <Card className="divide-y divide-white/5">
                  {group.items.map(item => (
                    <LineRow key={item.id} item={item} />
                  ))}
                </Card>
              </View>
            ))
          )}
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Documentos emitidos"
            subtitle="Comprovativos do que já foi impresso"
          />
          {docsUnavailable ? (
            <Card className="gap-1 border-white/10 bg-white/5">
              <Text className="text-sm font-semibold text-white/70">
                Comprovativos indisponíveis de momento
              </Text>
              <Text className="text-xs leading-relaxed text-white/45">
                Peça cópia na recepção. O restante extrato está actualizado.
              </Text>
            </Card>
          ) : docs.length === 0 ? (
            <EmptyState
              title="Ainda não foi emitido nenhum documento"
              hint="Quando a recepção emitir um extrato, o comprovativo fica guardado aqui."
            />
          ) : (
            docs.map(doc => (
              <Pressable
                key={doc.id}
                accessibilityRole="button"
                onPress={() => setOpenDoc(doc)}
                className="active:opacity-80"
              >
                <Card className="gap-1.5">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-sm font-bold text-white">{doc.doc_number}</Text>
                    <Badge label={DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type} tone="accent" />
                  </View>
                  <Text className="text-xs text-white/50">
                    {formatDay(doc.created_at)} · {formatClock(doc.created_at)} ·{' '}
                    {PRINTER_LABEL[doc.printer] ?? doc.printer}
                  </Text>
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-[11px] text-white/40">
                      {doc.line_count} {doc.line_count === 1 ? 'linha' : 'linhas'}
                    </Text>
                    <Text className="text-sm font-bold text-gold">{formatKz(doc.total)}</Text>
                  </View>
                  <Text className="text-[11px] font-semibold text-aqua">Ver comprovativo ›</Text>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </>
    );
  }

  return (
    <Screen refreshControl={refreshControl}>
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Extrato da conta</Text>
        <Text className="text-sm text-white/50">
          Tudo o que consumiu no hotel, linha a linha e sem surpresas.
        </Text>
      </View>

      {body}

      {openDoc ? <StatementDocument doc={openDoc} onClose={() => setOpenDoc(null)} /> : null}
    </Screen>
  );
}
