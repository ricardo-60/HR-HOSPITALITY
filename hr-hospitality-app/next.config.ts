import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
};

// Headers de segurança HTTP injetados em todas as rotas no build de produção
const securityHeaders: Array<{ key: string; value: string }> = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' https://storage.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; object-src 'none'; frame-src 'none'; base-uri 'self';",
  },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
];

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
  // Injetar headers de segurança apenas no build de produção (não no dev)
  if (phase === PHASE_PRODUCTION_BUILD) {
    nextConfig.headers = () => securityHeaders as any;
  }
  return nextConfig;
};

export default config;
