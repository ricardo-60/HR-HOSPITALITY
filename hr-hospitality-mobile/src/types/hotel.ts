/**
 * Tipos de domínio do Hotel Lukweku.
 *
 * Espelham as tabelas de `migrations/supabase/001_initial_schema.sql` e as
 * tabelas de catálogo público introduzidas em `006_mobile_public_catalog.sql`.
 */

export type RoomStatus = 'DISPONIVEL' | 'OCUPADO' | 'LIMPEZA' | 'MANUTENCAO';

export type RoomType = 'Standard' | 'Double' | 'Suite' | 'Suite Premium';

export interface HotelRoom {
  id: string;
  room_number: string;
  room_type: RoomType;
  status: RoomStatus;
  /** `DECIMAL(10,2)` chega como string no PostgREST. */
  price_per_night: number | string;
  floor: number;
  description: string | null;
}

/** Linhas de preço do catálogo público de piscinas. */
export interface PoolPrice {
  id: string;
  pool_id: string;
  label: string;
  /** Preço por pessoa por período. */
  price: number;
  unit: string;
  sort_order: number;
}

export interface Pool {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  depth_min_m: number | null;
  depth_max_m: number | null;
  opening_hours: string | null;
  image_url: string | null;
  is_active: boolean;
  prices?: PoolPrice[];
}

export interface LaundryService {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  turnaround_hours: number;
  sort_order: number;
  is_active: boolean;
}

export interface EventSpace {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  capacity: number | null;
  price_per_hour: number;
  price_per_day: number | null;
  image_url: string | null;
  is_active: boolean;
}

export type BookingServiceType =
  | 'quarto'
  | 'piscina'
  | 'evento'
  | 'lavandaria'
  | 'conferencia'
  | 'restaurante'
  | 'transfer';

export type ReservationStatus =
  | 'PENDENTE_PAGAMENTO'
  | 'CONFIRMADA'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELADA';

export interface Reservation {
  id: string;
  reference: string;
  guest_name: string;
  email: string;
  service_type: BookingServiceType;
  status: ReservationStatus;
  reservation_date: string;
  total_amount: number | string;
  notes: string | null;
  created_at: string;
}

/** Rascunho mantido em memória durante o fluxo de reserva. */
export interface BookingDraft {
  serviceType: BookingServiceType;
  title: string;
  /** Preço unitário em Kz. */
  unitPrice: number;
  quantity: number;
  date: string;
  /** Metadados livres para o `notes` da reserva. */
  detail?: Record<string, string | number | null>;
  notes?: string;
}

export function draftTotal(draft: BookingDraft): number {
  return Math.round(draft.unitPrice * draft.quantity * 100) / 100;
}
