/**
 * Configuração institucional do Hotel Lukweku.
 *
 * IMPORTANTE: IBAN, telefone e preçários de referência são PLACEHOLDERS.
 * Substitua-os pelos dados reais do hotel antes de publicar em loja.
 * Enquanto `isPlaceholderIban()` devolver `true`, o ecrã de checkout recusa-se a
 * apresentar instruções de pagamento, para que ninguém envie dinheiro para uma
 * conta inventada por este repositório.
 */

export const HOTEL = {
  name: 'Hotel Lukweku',
  tagline: 'Luanda, Angola',
  currency: 'Kz',
  phone: '+244900000000',
  email: 'reservas@hotellukweku.ao',
  address: 'Luanda, Angola',
} as const;

/** Chave de tenant única, igual à do projeto Electron/Supabase principal. */
export const TENANT_ID = '11111111-1111-1111-1111-111111111111';

/** ATENÇÃO: IBAN fictício. Substitua pelo IBAN real do hotel. */
export const HOTEL_IBAN = 'AO06 0000 0000 0000 0000 0000 0';
export const HOTEL_IBAN_HOLDER = 'Hotel Lukweku, Lda.';

export function isPlaceholderIban(iban: string = HOTEL_IBAN): boolean {
  return /^AO06(\s*0)+$/.test(iban.trim());
}

export const PAYMENT_INSTRUCTIONS = [
  'Faça a transferência para o IBAN indicado, usando o número da reserva como descritivo.',
  'Envie o comprovativo por WhatsApp para validação pela recepção.',
  'A reserva só fica confirmada depois de a recepção validar o pagamento.',
] as const;

/**
 * Preçários ilustrativos usados quando não existe cache nem rede.
 * Não são valores oficiais: substitua pelos preços reais do hotel.
 */
export const FALLBACK_POOL_PRICES: Record<
  string,
  { label: string; price: number; unit: string }[]
> = {
  'piscina-inferior': [
    { label: 'Adulto — acesso diário', price: 8000, unit: 'Kz/pessoa' },
    { label: 'Criança (até 12 anos) — acesso diário', price: 4000, unit: 'Kz/pessoa' },
  ],
  'piscina-superior': [
    { label: 'Adulto — acesso diário', price: 12000, unit: 'Kz/pessoa' },
    { label: 'Criança (até 12 anos) — acesso diário', price: 6000, unit: 'Kz/pessoa' },
  ],
};

export const FALLBACK_LAUNDRY: {
  slug: string;
  name: string;
  price: number;
  unit: string;
  turnaround_hours: number;
}[] = [
  { slug: 'lavagem-regular', name: 'Lavagem regular', price: 3000, unit: 'Kz/kg', turnaround_hours: 24 },
  { slug: 'lavagem-expressa', name: 'Lavagem expressa', price: 6000, unit: 'Kz/kg', turnaround_hours: 6 },
  { slug: 'limpeza-a-seco', name: 'Limpeza a seco', price: 12000, unit: 'Kz/peça', turnaround_hours: 48 },
  { slug: 'passadeira', name: 'Passadeira', price: 500, unit: 'Kz/peça', turnaround_hours: 12 },
];
