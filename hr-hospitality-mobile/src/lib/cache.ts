import AsyncStorage from '@react-native-async-storage/async-storage';

const NAMESPACE = 'lukweku:v1';

export interface CacheEntry<T> {
  value: T;
  /** Epoch ms. */
  storedAt: number;
}

export type CacheFreshness = 'fresh' | 'stale' | 'missing';

function key(name: string) {
  return `${NAMESPACE}:${name}`;
}

/**
 * Cache local leve para leitura offline de catálogos (piscinas, preçários,
 * quartos). Estratégia deliberadamente simples: um valor por chave, com
 * timestamp, e nada de invalidação em cascata — os catálogos mudam com pouca
 * frequência e a app aceita dados antigos em vez de ecrãs vazios.
 */
export async function readCache<T>(name: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed?.storedAt !== 'number') return null;
    return parsed;
  } catch {
    // Cache corrompido ou ilegível: trata como ausência.
    return null;
  }
}

export async function writeCache<T>(name: string, value: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { value, storedAt: Date.now() };
    await AsyncStorage.setItem(key(name), JSON.stringify(entry));
  } catch {
    // Sem espaço ou storage indisponível: a app continua apenas sem cache.
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(k => k.startsWith(NAMESPACE));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Ignorado: limpar cache nunca deve quebrar a app.
  }
}

export function freshness(entry: CacheEntry<unknown> | null, ttlMs: number): CacheFreshness {
  if (!entry) return 'missing';
  return Date.now() - entry.storedAt <= ttlMs ? 'fresh' : 'stale';
}

export function ageLabel(entry: CacheEntry<unknown> | null): string | null {
  if (!entry) return null;
  const minutes = Math.floor((Date.now() - entry.storedAt) / 60000);
  if (minutes < 1) return 'actualizado agora mesmo';
  if (minutes < 60) return `actualizado há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `actualizado há ${hours} h`;
  return `actualizado há ${Math.floor(hours / 24)} dias`;
}

export const CACHE_TTL = {
  catalog: 6 * 60 * 60 * 1000,
  priceList: 12 * 60 * 60 * 1000,
} as const;
