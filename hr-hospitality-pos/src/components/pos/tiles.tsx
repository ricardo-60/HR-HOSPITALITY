import { Pressable, Text, View } from 'react-native';

import { STATUS_LABEL, type PosTable } from '@/types/pos';

/** Cor do estado, pensada para leitura rápida à distância. */
const STATUS_BG: Record<PosTable['status'], string> = {
  LIVRE: 'bg-tableFree/15 border-tableFree/50',
  OCUPADA: 'bg-tableBusy/15 border-tableBusy/50',
  RESERVADA: 'bg-tableReserved/15 border-tableReserved/50',
  MANUTENCAO: 'bg-tableDown/15 border-tableDown/50',
};

const STATUS_TEXT: Record<PosTable['status'], string> = {
  LIVRE: 'text-tableFree',
  OCUPADA: 'text-tableBusy',
  RESERVADA: 'text-tableReserved',
  MANUTENCAO: 'text-tableDown',
};

export function TableTile({
  table,
  active = false,
  onPress,
}: {
  table: PosTable;
  active?: boolean;
  onPress?: (table: PosTable) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress?.(table)}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Mesa ${table.name}, ${STATUS_LABEL[table.status]}`}
      accessibilityState={{ selected: active }}
      className={`w-[132px] h-[132px] rounded-3xl border-2 p-3 justify-between ${STATUS_BG[table.status]} ${active ? 'border-aqua' : ''} ${onPress ? 'active:opacity-80' : ''}`}
    >
      <View>
        <Text className="text-3xl font-black text-white">{table.name}</Text>
        <Text className="text-[10px] font-bold text-white/40 mt-0.5">{table.seats} lugares</Text>
      </View>
      <Text className={`text-[11px] font-black uppercase tracking-wider ${STATUS_TEXT[table.status]}`}>
        {STATUS_LABEL[table.status]}
      </Text>
    </Pressable>
  );
}

export function ProductTile({
  name,
  category,
  price,
  onPress,
  disabled = false,
}: {
  name: string;
  category: string;
  price: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${price}`}
      className={`min-h-[76px] flex-1 rounded-2xl border border-white/10 bg-ink-soft px-4 py-3 justify-center ${disabled ? 'opacity-40' : 'active:bg-ink-line'}`}
    >
      <Text className="text-sm font-black text-white" numberOfLines={2}>{name}</Text>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-[10px] font-bold uppercase tracking-wider text-white/35">{category}</Text>
        <Text className="text-sm font-black text-gold">{price}</Text>
      </View>
    </Pressable>
  );
}
