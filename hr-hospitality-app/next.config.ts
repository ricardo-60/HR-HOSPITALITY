import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
};

const config = (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!hasUrl || !hasKey) {
      // Um build de produção sem credenciais só é permitido de forma explícita
      // e rotulada: `HR_DEMO_BUILD=1`. Nesse modo a aplicação arranca em
      // "modo demonstração" (sem sessão Supabase) e nunca deve ser distribuído
      // como instalador operacional.
      if (process.env.HR_DEMO_BUILD === '1') {
        console.warn(
          '\n  ⚠  HR_DEMO_BUILD=1 — build SEM Supabase. A aplicação arranca em modo demonstração.\n' +
            '     Preencha .env.local (ver .env.example) para um build operacional.\n'
        );
      } else {
        throw new Error(
          'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios no build de produção. ' +
            'Copie .env.example para .env.local e preencha os valores, ou defina HR_DEMO_BUILD=1 para um build de demonstração.'
        );
      }
    }
    if (hasUrl !== hasKey) {
      throw new Error(
        'Configuração Supabase incompleta: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em conjunto.'
      );
    }
  }
  return nextConfig;
};

export default config;
