/**
 * Ponto de entrada da camada de dados do HR-HOSPITALITY.
 * Exporta a camada híbrida (Supabase Cloud + SQLite Local offline).
 * Todos os componentes devem importar `supabase` deste ficheiro.
 */
import { dataLayer } from './dataLayer';

// Exporta a camada híbrida com a mesma interface do cliente Supabase
export const supabase = dataLayer;

// Re-exportar utilitários da camada nativa para uso direto quando necessário
export { supabaseClient } from './supabaseClient';
