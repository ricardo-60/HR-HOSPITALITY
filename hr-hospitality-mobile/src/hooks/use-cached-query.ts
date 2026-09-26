import { useCallback, useEffect, useRef, useState } from 'react';

import { ageLabel, type QueryResult } from '@/lib/queries';

interface CachedQuery<T> {
  data: T | undefined;
  state: 'fresh' | 'stale' | 'missing';
  error: string | null;
  usedFallback: boolean;
  cachedLabel: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook cache-first para catálogos.
 *
 * Estratégia: mostra o cache guardado no dispositivo de imediato (offline
 * instantâneo) e revalida em segundo plano. Se a revalidação falhar, mantém o
 * cache e expõe o erro para a UI mostrar um aviso discreto — nunca um ecrã vazio.
 *
 * `key` é uma chave estável (por exemplo `'rooms'` ou `` `res:${email}` ``), não
 * um array de dependências: o `loader` é lido por referência a partir de um ref,
 * por isso as funções inline dos ecrãs não provocam recargas infinitas.
 *
 * Nenhum `setState` corre de forma síncrona no corpo do efeito: o resultado só é
 * publicado dentro dos callbacks da promise, o que evita renderizações em
 * cascata e satisfaz as regras estritas de `react-hooks` do React Compiler.
 */
export function useCachedQuery<T>(loader: () => Promise<QueryResult<T>>, key: string): CachedQuery<T> {
  const [result, setResult] = useState<QueryResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);

  // Mantém o loader acessível fora do ciclo de render. Declarado antes do
  // efeito de carga para ser inicializado antes de a carga começar.
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const run = useCallback(async (isCancelled: () => boolean) => {
    try {
      const next = await loaderRef.current();
      if (isCancelled()) return;
      setResult(next);
      setLoading(false);
    } catch {
      if (isCancelled()) return;
      setResult(prev => prev ?? { data: undefined as T, state: 'missing', cachedAt: null, usedFallback: false, error: null });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void run(() => !active);
    return () => {
      active = false;
    };
  }, [run, key]);

  // `refresh` é chamado por um gesto do utilizador, nunca durante o render.
  const refresh = useCallback(async () => {
    setLoading(true);
    await run(() => false);
  }, [run]);

  return {
    data: result?.data,
    state: result?.state ?? 'missing',
    error: result?.error ?? null,
    usedFallback: result?.usedFallback ?? false,
    cachedLabel: result ? ageLabel({ value: null, storedAt: result.cachedAt ?? 0 }) : null,
    loading,
    refresh,
  };
}
