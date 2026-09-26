# Hotel Lukweku — Aplicação Móvel

Cliente móvel do Hotel Lukweku para **Google Play** e **Apple App Store**.
Expo (SDK 57, React Native 0.86) + TypeScript + NativeWind + Expo Router, a
partilhar o mesmo backend Supabase do projeto HR-HOSPITALITY.

---

## 1. Requisitos

- Node.js **22.13.x+** (obrigatório pelo SDK 57)
- npm 11+
- Para build local: Xcode 26.4+ (iOS) e Android SDK (Android)
- Para build na nuvem: apenas a CLI do EAS

## 2. Arranque

```bash
npm install
cp .env.example .env      # preencher os dois valores EXPO_PUBLIC_*
npm start                 # abre o Expo dev server
```

Comandos úteis:

```bash
npx expo start            # dev server
npx expo run:ios          # build nativo iOS (requer macOS)
npx expo run:android      # build nativo Android
npx expo lint             # ESLint (eslint-config-expo)
npx tsc --noEmit          # verificação de tipos
npx expo-doctor           # diagnóstico de configuração e dependências
npx expo export --platform android   # bundle de verificação
```

## 3. Configuração

| Variável | Origem | Notas |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project Settings → API | Embarcada na app; não é segredo |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys → anon | A segurança real vem da RLS |

O prefixo `EXPO_PUBLIC_` é obrigatório. **Nunca** defina
`SUPABASE_SERVICE_ROLE_KEY` aqui: o ficheiro `.env` é embutido no pacote
publicado e a chave ficaria visível para qualquer utilizador.

Sem estas variáveis a app arranca em **modo demonstração**: mostra um aviso e
funciona apenas com o cache local.

## 4. Estrutura

```
src/
├── app/                      rotas (expo-router) — cada ficheiro é um ecrã
│   ├── _layout.tsx           providers + Stack
│   ├── (tabs)/               navegação por abas
│   │   ├── _layout.tsx       Início · Reservas · Piscinas · Serviços · Conta
│   │   ├── index.tsx         Dashboard
│   │   ├── reservas.tsx      histórico de reservas
│   │   ├── piscinas.tsx      piscina inferior e superior + preços
│   │   ├── servicos.tsx      lavandaria e atalhos
│   │   └── conta.tsx         configuração, cache, aviso de IBAN
│   ├── alojamento/           lista de quartos + detalhe e reserva
│   ├── eventos.tsx           salões de eventos
│   ├── lavandaria.tsx        serviços de lavandaria
│   ├── checkout.tsx          IBAN + comprovativo por WhatsApp
│   └── +not-found.tsx
├── components/
│   ├── ui/                   Screen, Card, Button, Badge, Field, EmptyState…
│   └── booking/              RoomCard, PoolCard, EventSpaceCard, LaundryCard
├── constants/hotel.ts        IBAN, contactos, preçários de fallback
├── hooks/use-cached-query.ts cache-first com revalidação
├── lib/
│   ├── supabase.ts           cliente (lazy, fail-closed)
│   ├── cache.ts              AsyncStorage com TTL
│   ├── queries.ts            acesso a dados + fallback offline
│   ├── format.ts             Kz e datas em pt-AO
│   └── whatsapp.ts           link wa.me e comprovativo formatado
├── providers/                BookingProvider (rascunho de reserva)
└── types/hotel.ts            tipos de domínio
```

## 5. Modo offline

`useCachedQuery` é **cache-first**: devolve o que está em
`AsyncStorage` de imediato e revalida em segundo plano. Se a rede falhar, mantém
o cache e a UI mostra `OfflineBanner` com a idade do dado. Os catálogos de
piscinas e preçários são os que mais beneficiam: são lidos com pouca frequência
e ficam disponíveis sem rede.

`Conta → Limpar cache offline` apaga tudo.

## 6. Segurança

- A app **não tem contas de hóspede**. `anon` não recebe `INSERT` nem `SELECT`
  sobre `hotel_reservations` (ver `migrations/supabase/006_mobile_public_catalog.sql`).
- Criar reserva passa pela Edge Function `create-reservation`, que valida a
  entrada e devolve a referência gerada no servidor por trigger. A referência
  nunca é escolhida pelo cliente.
- O estado nasce sempre `PENDENTE_PAGAMENTO`; só a recepção confirma.
- `anon` só lê `hotel_rooms` com `status = 'DISPONIVEL'`, e apenas por colunas
  de catálogo — `tenant_id` e `sync_status` não são concedidos.
- O rascunho de reserva vive só em memória: num dispositivo partilhado não
  sobrevive a um encerramento da app.

## 7. Antes de publicar em loja

1. **Substituir o IBAN** em `src/constants/hotel.ts`. Enquanto for o placeholder
   `AO06 000…`, a app recusa-se a enviar instruções de pagamento por WhatsApp e
   o ecrã Conta mostra um aviso.
2. **Substituir o telefone e email** reais em `src/constants/hotel.ts`.
3. **Confirmar os preços** no Supabase. Os valores de demonstração da migração
   006 e o `FALLBACK_*` do cliente são ilustrativos e devem coincidir.
4. **Aplicar a migração 006** e **publicar a Edge Function**:

   ```bash
   cd hr-hospitality-app
   node scripts/run_migrations.mjs --target=supabase --snapshot

   supabase secrets set APP_ALLOWED_ORIGINS="https://app.exemplo.ao"
   supabase secrets set APP_ALLOW_NULL_ORIGIN=true
   supabase functions deploy create-reservation
   ```

   `APP_ALLOW_NULL_ORIGIN=true` é necessário porque as apps nativas enviam
   `Origin: null`.
5. **Ícones e splash** próprios do hotel em `assets/images/`.
6. **EAS**: `npx eas-cli@latest build` e `npx eas-cli@latest submit`.
