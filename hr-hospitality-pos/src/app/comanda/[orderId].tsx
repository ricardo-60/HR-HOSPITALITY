import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CartRow, TotalBar } from '@/components/pos/cart';
import { ProductTile } from '@/components/pos/tiles';
import { Banner, Button, Card, EmptyState, Loading } from '@/components/ui';
import { formatKz } from '@/lib/format';
import {
  addOrderItem,
  cancelOrder,
  closeOrder,
  getOrder,
  listProducts,
  removeOrderItem,
  type Result,
} from '@/lib/posApi';
import {
  METHOD_LABEL,
  WALK_IN_METHODS,
  type PaymentMethod,
  type PosOrder,
  type PosProduct,
} from '@/types/pos';

const CATEGORIES = ['BEBIDA', 'COMIDA', 'CAFETERIA', 'SNACK', 'PISCINA', 'GINASIO', 'LAVANDARIA', 'outro'] as const;

function tap() {
  // Feedback táctil: numa app de venda, o operador confirma pelo toque e pelo
  // som/ vibração, sem precisar de olhar para o ecrã.
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Comanda aberta: escolher artigos, ajustar quantidades e liquidar.
 *
 * O total nunca é calculado aqui para envio: a base de dados recalcula-o a
 * partir das linhas, por isso o que o operador lê é sempre o que a base
 * aceitou.
 */
export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<PosOrder | null>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('TODOS');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const [orderResult, productResult] = await Promise.all([getOrder(orderId), listProducts()]);
        if (cancelled) return;
        if (!orderResult.ok) setError(orderResult.error);
        else setOrder(orderResult.data);
        if (productResult.ok) setProducts(productResult.data);
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  const reload = async () => {
    if (!orderId) return;
    const result = await getOrder(orderId);
    if (!result.ok) setError(result.error);
    else setOrder(result.data);
  };

  const add = async (product: PosProduct) => {
    if (!orderId) return;
    tap();
    setBusy(true);
    setError(null);
    const result = await addOrderItem({ orderId, product, quantity: 1 });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    await reload();
  };

  const changeQuantity = async (itemId: string, delta: number) => {
    if (!order?.items) return;
    const item = order.items.find(line => line.id === itemId);
    if (!item) return;

    tap();
    setError(null);
    if (item.quantity + delta <= 0) {
      const removed = await removeOrderItem(itemId);
      if (!removed.ok) setError(removed.error);
      await reload();
      return;
    }

    // Reduzir retira a linha e volta a inseri-la: a BD só expõe DELETE e
    // INSERT em `pos_order_items`, o que mantém o total sempre derivado.
    const removed = await removeOrderItem(itemId);
    if (!removed.ok) { setError(removed.error); return; }
    const product = products.find(p => p.id === item.product_id);
    if (!product) { await reload(); return; }
    const added = await addOrderItem({ orderId: item.order_id, product, quantity: item.quantity + delta });
    if (!added.ok) setError(added.error);
    await reload();
  };

  const remove = async (itemId: string) => {
    tap();
    const result = await removeOrderItem(itemId);
    if (!result.ok) { setError(result.error); return; }
    await reload();
  };

  const liquidate = async (method: PaymentMethod) => {
    if (!orderId) return;
    tap();
    setBusy(true);
    setError(null);
    const result: Result<PosOrder> = await closeOrder({ orderId, paymentMethod: method });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setNotice(`Comanda ${result.data.order_number} liquidada por ${METHOD_LABEL[method]}.`);
    setTimeout(() => router.replace('/'), 900);
  };

  const abandon = async () => {
    if (!orderId) return;
    setBusy(true);
    const result = await cancelOrder(orderId);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    router.replace('/');
  };

  const visibleProducts = useMemo(
    () => (category === 'TODOS' ? products : products.filter(p => p.category === category)),
    [products, category],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-ocean-dark">
        <Loading label="A carregar a comanda…" />
      </View>
    );
  }

  if (!order) {
    return (
      <ScrollView className="flex-1 bg-ocean-dark" contentContainerClassName="p-4 gap-4">
        <Banner tone="error" message={error ?? 'Comanda indisponível.'} />
        <Button label="Voltar" variant="secondary" onPress={() => router.replace('/')} />
      </ScrollView>
    );
  }

  const isRoomCharge = order.reservation_id !== null;
  const lines = order.items ?? [];

  return (
    <ScrollView className="flex-1 bg-ocean-dark" contentContainerClassName="gap-4 p-4 pb-24">
      <View className="flex-row items-center justify-between gap-3 border-b border-white/10 pb-3">
        <View className="flex-1">
          <Text className="text-xl font-black text-white">
            {order.order_number} · {order.table_name ?? 'Venda avulsa'}
          </Text>
          <Text className="text-xs text-white/45 mt-0.5">
            {isRoomCharge
              ? `Conta do quarto ${order.room_number ?? '—'} · ${order.guest_name ?? ''}`
              : order.customer_name ?? 'Cliente externo'}
          </Text>
        </View>
        {isRoomCharge ? (
          <View className="rounded-full border border-aqua/40 bg-aqua/10 px-3 py-1.5">
            <Text className="text-[10px] font-black uppercase text-aqua">Hóspede</Text>
          </View>
        ) : null}
      </View>

      {error ? <Banner tone="error" message={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}

      <View className="gap-2">
        {lines.length === 0 ? (
          <EmptyState title="Comanda vazia" hint="Toque num artigo abaixo para começar." />
        ) : (
          lines.map(line => (
            <CartRow
              key={line.id}
              item={line}
              onIncrement={() => void changeQuantity(line.id, 1)}
              onDecrement={() => void changeQuantity(line.id, -1)}
              onRemove={() => void remove(line.id)}
            />
          ))
        )}
      </View>

      <TotalBar
        subtotal={order.subtotal}
        discount={order.discount}
        total={order.total}
        serviceLabel={isRoomCharge ? 'Lançado na conta do quarto' : 'Venda avulsa'}
      />

      <View className="gap-2">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">Adicionar artigo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-2">
          {['TODOS', ...CATEGORIES].map(option => (
            <Pressable
              key={option}
              onPress={() => setCategory(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === option }}
              className={`rounded-full border px-4 py-2 ${
                category === option
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-white/15 bg-white/5 text-white/50'
              }`}
            >
              <Text className="text-[11px] font-black uppercase tracking-wider">{option}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View className="mt-2 flex-row flex-wrap gap-2">
          {visibleProducts.length === 0 ? (
            <Text className="text-xs text-white/40 py-4">Sem artigos nesta categoria.</Text>
          ) : (
            visibleProducts.map(product => (
              <ProductTile
                key={product.id}
                name={product.name}
                category={product.category}
                price={formatKz(product.price)}
                disabled={busy}
                onPress={() => void add(product)}
              />
            ))
          )}
        </View>
      </View>

      <Card className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">Liquidar</Text>
        <View className="flex-row flex-wrap gap-2">
          {(isRoomCharge ? (['CONTA_DO_QUARTO'] as PaymentMethod[]) : WALK_IN_METHODS).map(method => (
            <Button
              key={method}
              label={METHOD_LABEL[method]}
              variant="success"
              loading={busy}
              onPress={() => void liquidate(method)}
              className="flex-1 min-w-[160px]"
            />
          ))}
        </View>
        <Button label="Cancelar comanda" variant="danger" disabled={busy} onPress={() => void abandon()} />
        <Text className="text-[11px] text-white/35 leading-relaxed">
          {isRoomCharge
            ? 'O valor entra na conta do quarto e é liquidado no checkout geral. A base de dados recusa fechar a comanda por outro meio.'
            : 'O valor é registado no turno de caixa aberto, por meio de pagamento.'}
        </Text>
      </Card>
    </ScrollView>
  );
}
