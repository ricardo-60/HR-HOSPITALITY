import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Field, Header, Loading } from '@/components/ui';
import { formatKz, formatDateTime } from '@/lib/format';
import { closeCashSession, listCashSessions, openCashSession } from '@/lib/posApi';
import { usePOS } from '@/providers/POSProvider';
import type { CashSession } from '@/types/pos';

/**
 * Caixa do turno.
 *
 * A base de dados só admite uma caixa aberta por hotel, o que impede dois
 * operadores de contar o mesmo dinheiro em simultâneo. O fecho calcula a
 * diferença entre o declarado e o esperado — o sistema não corrige a contagem,
 * apenas a evidencia.
 */
export default function CashScreen() {
  const router = useRouter();
  const { profile } = usePOS();

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await listCashSessions();
        if (cancelled) return;
        if (!result.ok) setError(result.error);
        else setSessions(result.data);
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const current = sessions.find(session => session.status === 'ABERTA') ?? null;

  const open = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await openCashSession(Number(openingCash) || 0);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setNotice(`Caixa ${result.data.session_number} aberta.`);
    const refreshed = await listCashSessions();
    if (refreshed.ok) setSessions(refreshed.data);
  };

  const close = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await closeCashSession(current.id, Number(closingCash) || 0, notes);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setNotice(`Caixa ${current.session_number} fechada.`);
    setNotes('');
    const refreshed = await listCashSessions();
    if (refreshed.ok) setSessions(refreshed.data);
  };

  return (
    <ScrollView className="flex-1 bg-ocean-dark" contentContainerClassName="gap-4 p-4 pb-24">
      <Header title="Caixa" subtitle={profile?.name ?? ''} />

      {error ? <Banner tone="error" message={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}

      {loading ? (
        <Loading label="A carregar a caixa…" />
      ) : current ? (
        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-black text-white">{current.session_number}</Text>
            <View className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1">
              <Text className="text-[10px] font-black uppercase text-emerald-300">Aberta</Text>
            </View>
          </View>
          <Text className="text-xs text-white/45">Aberta em {formatDateTime(current.opened_at)}</Text>

          <View className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
            <View>
              <Text className="text-[10px] font-black uppercase text-white/35">Fundo inicial</Text>
              <Text className="text-sm font-black text-white mt-0.5">{formatKz(current.opening_cash)}</Text>
            </View>
            <View>
              <Text className="text-[10px] font-black uppercase text-white/35">Multicaixa</Text>
              <Text className="text-sm font-black text-white mt-0.5">{formatKz(current.system_multicaixa)}</Text>
            </View>
            <View>
              <Text className="text-[10px] font-black uppercase text-white/35">TPA</Text>
              <Text className="text-sm font-black text-white mt-0.5">{formatKz(current.system_tpa)}</Text>
            </View>
            <View>
              <Text className="text-[10px] font-black uppercase text-white/35">Transferências</Text>
              <Text className="text-sm font-black text-white mt-0.5">{formatKz(current.system_transfer)}</Text>
            </View>
            <View>
              <Text className="text-[10px] font-black uppercase text-white/35">Conta do quarto</Text>
              <Text className="text-sm font-black text-aqua mt-0.5">{formatKz(current.system_room_charge)}</Text>
            </View>
            <View>
              <Text className="text-[10px] font-black uppercase text-white/35">Esperado em caixa</Text>
              <Text className="text-sm font-black text-white mt-0.5">
                {current.expected_cash === null ? '—' : formatKz(current.expected_cash)}
              </Text>
            </View>
          </View>

          <View className="gap-3 border-t border-white/10 pt-3">
            <Field
              label="Dinheiro contado no fecho"
              value={closingCash}
              onChangeText={setClosingCash}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
            <Field
              label="Observações"
              value={notes}
              onChangeText={setNotes}
              placeholder="Diferenças, notas de turno…"
            />
            <Button label="Fechar caixa" variant="danger" loading={busy} onPress={() => void close()} />
          </View>
        </Card>
      ) : (
        <Card className="gap-3">
          <Text className="text-sm text-white/60">Nenhuma caixa aberta. Abre um turno antes de vender.</Text>
          <Field
            label="Fundo inicial em numerário"
            value={openingCash}
            onChangeText={setOpeningCash}
            placeholder="0,00"
            keyboardType="decimal-pad"
          />
          <Button label="Abrir caixa" loading={busy} onPress={() => void open()} />
        </Card>
      )}

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">Turnos anteriores</Text>
        {sessions.length === 0 ? (
          <EmptyState title="Sem turnos registados" />
        ) : (
          <View className="gap-2">
            {sessions
              .filter(session => session.status !== 'ABERTA')
              .map(session => (
                <Card key={session.id} className="flex-row items-center justify-between gap-3">
                  <View>
                    <Text className="text-sm font-black text-white">{session.session_number}</Text>
                    <Text className="text-[11px] text-white/40 mt-0.5">{formatDateTime(session.opened_at)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-black text-white">
                      {session.difference === null ? '—' : formatKz(session.difference)}
                    </Text>
                    <Text className="text-[10px] font-black uppercase text-white/35">diferença</Text>
                  </View>
                </Card>
              ))}
          </View>
        )}
      </View>

      <Button label="Voltar" variant="secondary" onPress={() => router.replace('/')} />
    </ScrollView>
  );
}
