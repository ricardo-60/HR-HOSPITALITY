/** Tipos de domínio do POS. Espelham as tabelas da migração 008. */

export type TableZone = 'SNACK_BAR' | 'BALCAO' | 'ESPLANADA' | 'PISCINA' | 'RESTAURANTE';
export type TableStatus = 'LIVRE' | 'OCUPADA' | 'RESERVADA' | 'MANUTENCAO';
export type OrderStatus = 'ABERTA' | 'FECHADA' | 'PAGA' | 'CANCELADA';
export type PaymentMethod = 'MULTICAIXA_EXPRESS' | 'TRANSFERENCIA' | 'TPA' | 'DINHEIRO' | 'CONTA_DO_QUARTO';
export type MovementType = 'ENTRADA' | 'SAIDA' | 'QUEBRA' | 'INVENTARIO' | 'AJUSTE';

/** Tipologia da propriedade, migrada em 010 para `tenants.property_type`. */
export type PropertyType = 'HOTEL' | 'HOSPEDARIA' | 'RESORT' | 'COMPLEXO';

/** Serviços ativos da propriedade, migrados em 010 para `tenants.active_services`. */
export type TenantService = 'ROOMS' | 'BAR' | 'RESTAURANT' | 'POOL' | 'GYM' | 'LAUNDRY' | 'EVENTS';

/**
 * Identidade comercial do tenant para o cabeçalho dinâmico.
 *
 * `propertyType` e `activeServices` são `null`/vazios quando a migração 010
 * ainda não foi aplicada: o cabeçalho degrada para o nome, sem partir.
 */
export interface TenantIdentity {
  name: string | null;
  companyName: string | null;
  propertyType: PropertyType | null;
  activeServices: TenantService[];
}

/** Linha de `daily_expenses` para a vista de despesas do dia. */
export interface DailyExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  supplier: string | null;
}

export interface PosTable {
  id: string;
  code: string;
  name: string;
  zone: TableZone;
  seats: number;
  status: TableStatus;
  sort_order: number;
}

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  affects_inventory: boolean;
  inventory_item_id: string | null;
}

export interface PosOrder {
  id: string;
  order_number: string;
  table_id: string | null;
  table_name: string | null;
  reservation_id: string | null;
  room_number: string | null;
  guest_name: string | null;
  customer_name: string | null;
  guest_count: number;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  subtotal: number;
  discount: number;
  total: number;
  opened_at: string;
  closed_at: string | null;
  items?: PosOrderItem[];
}

export interface PosOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  notes: string | null;
}

export interface CashSession {
  id: string;
  session_number: string;
  status: 'ABERTA' | 'FECHADA' | 'ANULADA';
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  system_multicaixa: number;
  system_tpa: number;
  system_transfer: number;
  system_room_charge: number;
}

/** Estadia activa usável para lançar uma comanda na conta do quarto. */
export interface StayCharge {
  reservation_id: string;
  reference: string;
  room_number: string | null;
  guest_name: string;
  status: string;
}

export const ZONE_LABEL: Record<TableZone, string> = {
  SNACK_BAR: 'Snack-Bar',
  BALCAO: 'Balcão',
  ESPLANADA: 'Esplanada',
  PISCINA: 'Piscina',
  RESTAURANTE: 'Restaurante',
};

export const STATUS_LABEL: Record<TableStatus, string> = {
  LIVRE: 'Livre',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
  MANUTENCAO: 'Manutenção',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  MULTICAIXA_EXPRESS: 'Multicaixa Express',
  TRANSFERENCIA: 'Transferência',
  TPA: 'TPA',
  DINHEIRO: 'Dinheiro',
  CONTA_DO_QUARTO: 'Conta do quarto',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  QUEBRA: 'Quebra',
  INVENTARIO: 'Inventário',
  AJUSTE: 'Ajuste',
};

export const PROPERTY_LABEL: Record<PropertyType, string> = {
  HOTEL: 'Hotel',
  HOSPEDARIA: 'Hospedaria',
  RESORT: 'Resort',
  COMPLEXO: 'Complexo',
};

export const SERVICE_LABEL: Record<TenantService, string> = {
  ROOMS: 'Quartos',
  BAR: 'Bar',
  RESTAURANT: 'Restaurante',
  POOL: 'Piscina',
  GYM: 'Ginásio',
  LAUNDRY: 'Lavandaria',
  EVENTS: 'Eventos',
};

/** Ordem fixa dos chips de serviços no cabeçalho. */
export const SERVICE_ORDER: TenantService[] = ['ROOMS', 'BAR', 'RESTAURANT', 'POOL', 'GYM', 'LAUNDRY', 'EVENTS'];

/** Rótulos das categorias de `daily_expenses` (migração 010). */
export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  FORNECEDOR: 'Fornecedores',
  MANUTENCAO: 'Manutenção',
  COMPRA: 'Compras',
  SANGRIA: 'Sangrias',
  SERVICOS: 'Serviços',
  SALARIOS: 'Salários',
  IMPOSTOS: 'Impostos',
  TRANSPORTE: 'Transportes',
  ENERGIA: 'Energia',
  OUTRO: 'Outros',
};

/** Meios válidos para liquidar uma comanda, por contexto. */
export const WALK_IN_METHODS: PaymentMethod[] = [
  'MULTICAIXA_EXPRESS',
  'TPA',
  'DINHEIRO',
];

export function orderIsOpen(order: Pick<PosOrder, 'status'>): boolean {
  return order.status === 'ABERTA';
}
