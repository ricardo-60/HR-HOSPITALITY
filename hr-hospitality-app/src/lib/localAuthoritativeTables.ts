/**
 * HR-HOSPITALITY — Tabelas do registo operacional fechado (Local-First).
 *
 * CORREÇÃO DE SPLIT-BRAIN
 * -----------------------
 * A camada híbrida (`dataLayer`) tentava ler estas tabelas no Supabase Cloud
 * antes de recorrer ao SQLite local. Como o CRM/KYC (`clients`, `client_visits`,
 * `loyalty_tiers`, `client_biometrics`) nunca foi criado na nuvem, e as colunas
 * `client_id` / `client_number` também não, o efeito prático era:
 *
 *   1. O Dashboard e o Alojamento renderizavam reservas FANTASMA que só
 *      existiam na nuvem (Maria da Conceição, Ana Paula Silva, …), sem
 *      qualquer cliente KYC associado — impossíveis de cancelar ou concluir,
 *      porque o motor de operações só conhece o SQLite local.
 *   2. As escritas novas (check-in, cancelar, check-out) falhavam na nuvem
 *      (400: coluna inexistente) e caíam em silêncio para o local, ficando
 *      invisíveis na UI — cada widget lia uma base de dados diferente.
 *
 * ESTA É A FONTE DE VERDADE DO HOTEL. As tabelas listadas abaixo são o registo
 * fechado de `electron/operations.js` (RESOURCE_SPECS) e lêem e escrevem SEMPRE
 * no SQLite local, servido pela API segura em 127.0.0.1:3002.
 *
 * A nuvem Supabase fica, por agora, reservada para autenticação e para uma
 * futura migração: quando o esquema remoto tiver as colunas de associação ao
 * cliente e as tabelas CRM, basta remover as tabelas desta lista para voltar a
 * sincronizar. Nada mais no código tem de mudar.
 */
export const LOCAL_AUTHORITATIVE_TABLES: ReadonlySet<string> = new Set([
  'hotel_rooms',
  'hotel_reservations',
  'hotel_consumptions',
  'pos_tables',
  'pos_table_consumptions',
  'clients',
  'client_visits',
  'client_biometrics',
  'loyalty_tiers',
]);

/** True quando a tabela pertence ao registo operacional e nunca vai à nuvem. */
export function isLocalAuthoritativeTable(tableName: string): boolean {
  return LOCAL_AUTHORITATIVE_TABLES.has(tableName);
}
