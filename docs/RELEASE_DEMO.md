# Release da demonstração — empacotamento e distribuição

> Preparado para a demonstração de segunda-feira. Este documento lista
> **exactamente o que existe**, **como se arranca em 1 clique**, **onde estão
> os links/QR na rede local** e **o que continua bloqueado** (sem ornamentação:
> se um binário não existe, diz-se porquê).

---

## 1. Estado dos artefactos

| # | Entregável | Estado | Onde |
| --- | --- | --- | --- |
| 1 | Servidor local 1-clique (migrações 001–008 + seeders + porta 3000 na LAN) | ✅ | `start-server.bat` / `start-server.sh` |
| 1b | Instalador Electron **Servidor** com atalho de área de trabalho | ✅ 171,9 MB | `hr-hospitality-app/dist/HR-Hospitality-Servidor-Setup-0.1.0.exe` |
| 1c | Instalador Electron **Cliente** com atalho de área de trabalho | ✅ 171,9 MB | `hr-hospitality-app/dist/HR-Hospitality-Cliente-Setup-0.1.0.exe` |
| 2 | APK `hr-client-app.apk` | ✅ 68,0 MB (assinado) | `dist/android/hr-client-app.apk` |
| 2 | APK `hr-pos-app.apk` | ✅ 56,3 MB (assinado) | `dist/android/hr-pos-app.apk` |
| 2 | APK `hr-executive-app.apk` | ✅ 56,2 MB (assinado) | `dist/android/hr-executive-app.apk` |
| 3 | `.ipa` iOS | ❌ não é possível nesta máquina | ver §6 |
| — | Página de downloads com QR na LAN | ✅ | `http://<ip>:3000/download/` |
| — | Servidor da LAN em `0.0.0.0:3000` | ✅ a correr | firewall já permite `node.exe` (ver §4) |

**Tamanhos reais (bytes):** `hr-client-app.apk` 71 347 382 ·
`hr-pos-app.apk` 58 982 772 · `hr-executive-app.apk` 58 945 908.
Todos assinados com o keystore de demo de `dist/keys/`
(`CN=HRHospitalityDemo, OU=Demo, O=HRHospitality`) e verificados com
`apksigner verify` — a assinatura é constante entre rebuilds, por isso o APK
novo é instalável **por cima** do que já estiver no telemóvel, sem desinstalar.

**Modo dos binários actuais: DEMONSTRAÇÃO.** `hr-hospitality-app/.env.local`
existe mas contém apenas os placeholders de `.env.example` (`SEU-PROJETO`),
pelo que o portal, o Electron e as apps foram compilados **sem credenciais
Supabase reais**. A aplicação arranca em modo demonstração (interface
completa, cache local, sem sessão ligada) e o próprio ecrã de login apresenta
`SUPABASE AUTH NÃO ESTÁ CONFIGURADO` — verificado no browser, §8. Isto é
deliberado e está sinalizado no build — ver §7.

---

## 2. Estrutura de pastas gerada

```
HR-HOSPITALITY/
├── start-server.bat            ← arranque 1 clique (Windows)
├── start-server.sh             ← arranque 1 clique (macOS / Linux / WSL)
├── build-android.ps1           ← gera os 3 APKs
├── build-ios.bat | build-ios.sh← gera o .ipa (via Expo EAS)
│
├── dist/                       (gitignored — binários)
│   ├── android/
│   │   ├── hr-client-app.apk
│   │   ├── hr-pos-app.apk
│   │   └── hr-executive-app.apk
│   ├── ios/
│   │   ├── HR-Hospitality.ipa      ← quando existir
│   │   └── README-BUILD-IOS.md
│   ├── download/
│   │   └── qr-portal.svg           ← QR do portal
│   └── keys/                       (gitignored — nunca para o Git)
│       ├── hr-demo-release.keystore
│       └── keystore.properties
│
├── hr-hospitality-app/
│   ├── dist/                   ← instaladores Electron (gerados pelo electron-builder)
│   │   ├── HR-Hospitality-Servidor-Setup-0.1.0.exe
│   │   ├── HR-Hospitality-Cliente-Setup-0.1.0.exe
│   │   └── win-unpacked/
│   ├── out/                    ← export estático Next (32 páginas)
│   │   └── download/           ← cópia publicada no portal (stage_downloads.mjs)
│   │       ├── index.html      ← página de downloads + QR
│   │       ├── qr-portal.svg
│   │       ├── windows/*.exe
│   │       ├── android/*.apk
│   │       └── ios/*
│   └── scripts/
│       ├── run_migrations.mjs  ← migrações SQLite/Supabase
│       ├── seed.mjs            ← seeders idempotentes
│       ├── check-migrations.mjs← verificador estrutural (118/118 OK)
│       ├── stage_downloads.mjs ← páginas + QR da LAN
│       ├── qr.mjs              ← QR no terminal/SVG
│       └── serve_static.mjs    ← servidor estático 0.0.0.0:3000
│
├── migrations/
│   ├── sqlite/001..007         ← 007 = novos perfis POS/EXECUTIVO
│   ├── supabase/001..008       ← núcleo comercial, POS, stock, RLS
│   └── seeders/
│       ├── sqlite_demo.sql
│       └── supabase_demo.sql
│
├── hr-hospitality-mobile/      ← app cliente (Expo SDK 57)
├── hr-hospitality-pos/         ← app POS tablet (Expo SDK 57)
├── hr-hospitality-executive/   ← app executiva (Expo SDK 57)
│   └── (as 3 com eas.json)
│
└── docs/
    ├── RELEASE_DEMO.md         ← este documento
    └── BUILD_IOS.md
```

Tudo o que está em `dist/`, `out/`, `*.db` e `.env*` está no `.gitignore`.

---

## 3. Arranque do servidor em 1 clique

### Windows
```
duplo clique em  start-server.bat
```

### macOS / Linux / WSL
```bash
./start-server.sh
```

### O que o script faz (nesta ordem)

| Passo | Acção | Falha se… |
| --- | --- | --- |
| 0 | Verifica `node` no PATH | Node ausente → mensagem + URL de instalação |
| 1 | Cria `hr-hospitality-app/.env.local` a partir de `.env.example` se não existir | — |
| 2 | Detecta se o Supabase está configurado | sem credenciais → **modo demonstração** (aviso) |
| 3 | Migrações SQLite `001..007` | erro → pára |
| 4 | Seeders SQLite (reservas, consumos, RH) | erro → pára |
| 5 | Migrações Supabase `001..008` + seeders **só** se `PGPASSWORD` e `SUPABASE_DB_HOST` estiverem no ambiente | sem secrets → ignorado com aviso |
| 6 | `next build` → `out/` (só se não existir, ou com `--rebuild`) | erro → pára |
| 7 | Deteção automática do IP da LAN | fallback `127.0.0.1` |
| 8 | QR do portal → `dist/download/qr-portal.svg` | módulo `qrcode` em falta → aviso, não pára |
| 9 | `stage_downloads.mjs` → copia binários para `out/download/` + página HTML + QR por ficheiro | — |
| 10 | Serve em **`0.0.0.0:3000`** (bloqueante; `Ctrl+C` ou tecla para parar) | — |

Re-execuções são baratas: as migrações e os seeders são idempotentes e o build
é reaproveitado. Forçar recompilação: `start-server.bat --rebuild`.

---

## 4. Endereços e QR na rede local

Com o servidor a correr, o script imprime:

```
============================================================
 SERVIDOR A ARRANCAR
 Portal          : http://localhost:3000
 Na rede local   : http://<IP_DA_LAN>:3000
 Downloads + QR  : http://<IP_DA_LAN>:3000/download/
============================================================
```

Na máquina desta sessão o IP é **`192.0.0.14`** (interface Wi-Fi, perfil de rede
**Público**).

### Onde fica definido o IP

O IP da LAN pode ser fixado em **`hr-hospitality-app/.env.local`**:

```
HR_IP=192.0.0.14
HR_PORT=3000
```

Quando lá está, `start-server.bat` / `start-server.sh` e `stage_downloads.mjs`
usam-no **em vez de detetarem sozinhos** — é assim que o `.env.local` "aponta" a
máquina ao endereço da rede local. Sem lá estar, o IP continua a ser detetado
automaticamente no arranque.

### Firewall (sem necessidade de admin)

Já existe uma regra de entrada **`Node.js JavaScript Runtime` → Allow →
qualquer porta → perfil Público e Privado** para `C:\Program Files\nodejs\node.exe`,
que é exactamente o binário usado pelo servidor. Criar uma regra nova exigiria
elevação (`netsh advfirewall` falha com *«A operação solicitada exige elevação»*),
mas **não é preciso**: a porta 3000 já está libertada para o `node.exe` do sistema.

| Recurso | URL |
| --- | --- |
| Portal / Painel Master | `http://192.0.0.14:3000/` |
| **Página de downloads + QR** | `http://192.0.0.14:3000/download/` |
| APK do cliente (link directo) | `http://192.0.0.14:3000/download/android/hr-client-app.apk` |
| QR do portal (ficheiro) | `dist/download/qr-portal.svg` |
| QR por APK/instalador | `http://192.0.0.14:3000/download/<grupo>/<ficheiro>.svg` |

Como é servido: `serve_static.mjs` liga a `0.0.0.0` (também por argumento, veja
abaixo), portanto qualquer telemóvel/PC da mesma rede acede pelo IP da máquina.
A página de downloads mostra, por artefacto, o tamanho, o link directo e um
**QR code** para abrir no telemóvel.

Arranque manual equivalente ao pedido para a demo:

```powershell
cd hr-hospitality-app
npm run build          # build de produção (modo demonstração sem credenciais)
npm run start -- -H 0.0.0.0 -p 3000
```

As flags `-H` / `-p` (ou `--host` / `--port`) são lidas por `serve_static.mjs`;
sem elas continuam a valer as variáveis de ambiente `HOST` / `PORT`.

Para instalar um APK a partir do QR: abrir a URL no Android → permitir
*fontes desconhecidas* quando solicitado.

---

## 5. APKs Android (Tarefa 2)

### Comando
```powershell
powershell -ExecutionPolicy Bypass -File .\build-android.ps1
# opções:  -Apps mobile,pos,executive   -SkipPrebuild   -Clean
```

### O que faz
1. Lê `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` de `hr-hospitality-app/.env.local`
   e escreve-as como `EXPO_PUBLIC_SUPABASE_*` em `.env` de cada app.
   **Sem credenciais → apaga `.env` → build em modo demonstração.**
2. Gera (uma vez) um keystore de demonstração em `dist/keys/` com password
   aleatória em `keystore.properties` — **fora do Git**.
3. `expo prebuild --platform android` → pasta `android/` (gitignored).
4. `gradlew :app:assembleRelease`.
5. Assina e verifica com `apksigner`, copiando para `dist/android/`.

### Pré-requisitos já verificados nesta máquina
- Android SDK em `%LOCALAPPDATA%\Android\Sdk`
- O Gradle instala automaticamente o que a app exige — **confirmado nesta entrega**:
  `build-tools 35.0.0`, `platform android-36` e **NDK 27.1.12297006 (~1 GB)**,
  todos com licença aceite e instalados sem intervenção
- JDK Temurin 21 (`JAVA_HOME`)
- Rede para descarregar Gradle 9.3.1 + AGP (feito)

### Correcção obrigatória em Windows: `MAX_PATH` e o laço do ninja

**Sintoma** (bloqueava os 3 APKs):

```
ninja: error: manifest 'build.ninja' still dirty after 100 tries
```

**Causa diagnosticada nesta entrega.** O CMake regista no `build.ninja` este edge,
que é quem o ninja tenta re-executar *ad infinitum*:

```ninja
build build.ninja: RERUN_CMAKE | ../../../../CMakeLists.txt \
  ../prefab/<abi>/prefab/lib/<triple>/cmake/ReactAndroid/ReactAndroidConfigVersion.cmake ...
```

Para `armeabi-v7a` esse caminho resolve-se, **a partir do directório de build, para
exactamente 260 caracteres** — o `MAX_PATH` do Windows:

| Componente | Comprimento |
| --- | --- |
| CWD (`…\HR-HOSPITALITY\hr-hospitality-executive\node_modules\react-native-screens\android\.cxx\RelWithDebInfo\6k515m5g\armeabi-v7a`) | 154 |
| `../prefab/armeabi-v7a/prefab/lib/arm-linux-androideabi/cmake/ReactAndroid/ReactAndroidConfigVersion.cmake` | 105 |
| **Absoluto (154 + 1 + 105)** | **260 → falha** |

O `stat` falha, o ninja marca o input como inexistente, o edge fica "sempre sujo"
e repete a regeneração 100 vezes. Piores casos medidos neste repo:

| App | ABI | Absoluto | Estado |
| --- | --- | --- | --- |
| `hr-hospitality-executive` | `armeabi-v7a` | 263 | ❌ |
| `hr-hospitality-mobile` | `armeabi-v7a` | 260 | ❌ |
| `hr-hospitality-pos` | `armeabi-v7a` | 257 | ⚠️ folga de 3 |
| `hr-hospitality-executive` | `arm64-v8a` | 259 | ⚠️ folga de 1 |

**Correcção.** `CMAKE_SUPPRESS_REGENERATION=ON` faz o CMake **não gerar** a aresta
`RERUN_CMAKE`, desaparecendo assim o input que não dá para medir — o ninja passa a
compilar directamente. A flag é injectada em **todos** os módulos Android (a app e
as bibliotecas nativas de `node_modules`, que têm o seu próprio bloco
`externalNativeBuild`) pelo **init script** `gradle-init.gradle`, passado a cada
invocação do Gradle via `--init-script` pelo próprio `build-android.ps1`.

Validação: `:react-native-worklets:buildCMakeRelWithDebInfo[armeabi-v7a]` passou de
`still dirty after 100 tries` a **`BUILD SUCCESSFUL in 1m 41s`**.

Também descartadas como solução (medido, não hipotético): `junction` e `subst` — o
Gradle canoniza o caminho de volta ao directório real, pelo que continuam a dar 260.

### Correcção 2: `CMAKE_OBJECT_PATH_MAX` (os caminhos `C_/Users/...`)

Depois de o laço do ninja desaparecer, os 3 APKs falharam na altura em que o ninja
começava a compilar de facto, agora neste:

```
:react-native-reanimated:buildCMakeRelWithDebInfo[arm64-v8a][reanimated] FAILED
ninja: error: mkdir(CMakeFiles/reanimated.dir/C_/Users/HP/Desktop/Desenvolver/HR-HOSPITALITY/hr-hospitality-executive/node_modules): No such file or directory
```

**Causa.** Os ficheiros `.cpp` que estão *fora* do directório-fonte do módulo
(por exemplo `react-native-reanimated/Common/cpp/...`, fora de `android/`) são
registrados pelo CMake em duas formas possíveis:

| Forma | Exemplo | Comprimento |
| --- | --- | --- |
| **com hash** (a preferida) | `CMakeFiles/reanimated.dir/<md5-32>/<relativo>` | curto e **independente** do caminho absoluto |
| **absoluta** (a de recurso) | `CMakeFiles/reanimated.dir/C_/Users/HP/.../RecordPropertiesInterpolator.cpp.o` | = 2 × (repo + app) + resto |

O CMake só usa a forma com hash enquanto ela couber em `CMAKE_OBJECT_PATH_MAX`
(**250 por omissão**); se não couber, cai para a absoluta — que é *ainda mais
comprida* e passa bem acima dos 260. Medido neste repo: **110 de 2172** saídas
mangled, pior caso em `hr-hospitality-executive`/`armeabi-v7a` a **394 caracteres**.

**Correcção.** `-DCMAKE_OBJECT_PATH_MAX=259` (o `MAX_PATH` do Windows são 260
contando o terminador), injectado pelo mesmo `gradle-init.gradle` em todos os
projectos Android. Passa a ser possível escolher a forma com hash, que não depende
do caminho da fonte.

### Correcção 3: deslocar o `.cxx` — `externalNativeBuild.cmake.buildStagingDirectory`

Restava uma classe de caminhos que **não é encurtável pelo CMake**: os ficheiros
*dentro* do directório-fonte são usados tal e qual:

```
<projectDir>/.cxx/RelWithDebInfo/<hash>/<abi>/
  rngesturehandler_codegen_autolinked_build/CMakeFiles/react_codegen_rngesturehandler_codegen.dir/
    react/renderer/components/rngesturehandler_codegen/ComponentDescriptors.cpp.o   ← 173 chars
```

Com o repo em `Desktop\Desenvolver\HR-HOSPITALITY` isso dava **296 caracteres
absolutos** — falha. Analisado à mão antes de mexer em qualquer coisa:

| | |
| --- | --- |
| `cwd` do módulo `app` | `repo + app + 53` = 122 |
| necessário para caber | `cwd ≤ 85` → cortar **≥ 37 caracteres** |
| corte máximo só nos nomes das apps | 23 → **insuficiente** |
| corte máximo só movendo o repo | 41 → só chega com margem de 4 |

Ou seja: **não há forma de resolver só encurtando o repo** — e movê-lo obriga a
reinstalar `node_modules`, refazer o build do Electron e mudar o `workspace`.

**Correcção escolhida.** O AGP permite mudar a raiz do `.cxx` (`build staging
directory`) *fora* da árvore do projecto, exactamente para estes casos:

```groovy
android.externalNativeBuild.cmake.buildStagingDirectory = 'C:\hrb\<projecto>-<hash>'
```

O `gradle-init.gradle` define-o em **todos** os projectos Android (a app e as
bibliotecas de `node_modules`), com uma chave curta e determinista
(nome Gradle + `String.hashCode()` do directório-fonte). Todos os sub-builds do
CMake — incluindo os codegen autolinkados — ficam debaixo desse directório, logo
`cwd` passa de 122 para ~53 sem tocar no repo, nos nomes das apps nem no
`node_modules`.

**Validação:** pior caminho absoluto de objecto passou de **394 → 257** (limite
seguro: 259).

> Efeito secundário útil: os `.cxx` antigos ficaram tão compridos que nem o
> `Remove-Item` conseguia apagá-los (é o próprio `MAX_PATH` a impedir). Foram
> removidos com o truque `robocopy <vazio> <alvo> /MIR` + `rmdir`.

### Resultado final (medido, não estimado)

```
BUILD SUCCESSFUL in 21m — 544 tarefas (516 executadas, 28 up-to-date)
```

Verificação automática sobre os **42** `build.ninja` gerados
(`verify-paths.ps1`, extrai a 1.ª saída de cada regra `build …` e junta-a à
directoria do ninja):

| Métrica | Antes | Depois |
| --- | --- | --- |
| Pior caminho absoluto de objecto | 394 caracteres | **257** |
| Caminhos acima de 259 | 110 (mangled `C_/Users/…`) | **0** |
| `still dirty after 100 tries` | frequente | **0** |
| `.cxx` dentro do repo | 9 (nem apagáveis) | **0** |

Pior caminho real, agora em `C:\hrb`:

```
C:\hrb\app-954f86c3\RelWithDebInfo\6t6n7016\arm64-v8a\rnscreens_autolinked_build\
  CMakeFiles\react_codegen_rnscreens.dir\c0d33f4495f6eee3719f7ad8c2a303af\
  react-native-screens\common\cpp\react\renderer\components\rnscreens\
  RNSFullWindowOverlayShadowNode.cpp.o
```

| APK | Tamanho | Bytes | `apksigner verify` |
| --- | --- | --- | --- |
| `hr-client-app.apk` | 68,0 MB | 71 347 382 | ✅ `CN=HRHospitalityDemo` |
| `hr-pos-app.apk` | 56,3 MB | 58 982 772 | ✅ idem |
| `hr-executive-app.apk` | 56,2 MB | 58 945 908 | ✅ idem |

### Regenerar **com** ligação ao Supabase
1. Preencher `hr-hospitality-app/.env.local`
2. Correr `.\build-android.ps1` — os APKs passam a `EXPO_PUBLIC_*` e ligam ao projeto real.

> As variáveis `EXPO_PUBLIC_*` ficam embutidas no APK. A
> `SUPABASE_SERVICE_ROLE_KEY` nunca pode estar lá — e não está.

---

## 6. iOS (Tarefa 3) — porquê que não há `.ipa`

Um `.ipa` **só** se constrói com o toolchain Apple:

| Via | Requisitos | Possível aqui? |
| --- | --- | --- |
| **A. Expo EAS (nuvem)** | conta Expo (grátis) + **Apple Developer Program (99 USD/ano)** | ⚠️ só com essas credenciais |
| **B. Local** | **macOS** com Xcode 16+ | ❌ esta máquina é Windows |

O que já está pronto (não falta nada do lado do projeto):

- `eas.json` nas 3 apps, perfil `preview` → `android.buildType: apk` e iOS distribuição
- `ios.bundleIdentifier`: `ao.hotel.lukweku`, `ao.hotel.lukweku.pos`, `ao.hotel.lukweku.gestao`
- `ios.icon`, `ITSAppUsesNonExemptEncryption`
- `build-ios.bat` / `build-ios.sh` e `docs/BUILD_IOS.md`

### Verificação efectuada nesta máquina
```console
> npx --yes eas-cli@latest whoami
Not logged in        (exit 1)
```
O toolchain EAS instala e corre; o que falta são **credenciais** (conta Expo +
Apple Developer), não código do projeto.

Para o destravar, **uma de duas**:
```bash
npx eas-cli login
npx eas-cli build -p ios --profile preview --non-interactive --no-wait \
      --output dist/ios/HR-Hospitality.ipa
```
ou correr o mesmo comando num Mac. Depois de o `.ipa` existir em `dist/ios/`,
o `start-server` publica-o automaticamente em `/download/ios/` com QR.

> **Custo real:** sem conta Apple Developer não existe `.ipa` — não há atalho
> técnico. Se a demonstração de segunda-feira precisar de iOS, é preciso decidir
> hoje entre a subscrição Apple ou apresentar o ecrã Android/simulador.

---

## 7. Modo actual dos binários — e como os tornar operacionais

Os binários desta entrega foram gerados **sem credenciais**:

| O que falta | Efeito | Onde se resolve |
| --- | --- | --- |
| `hr-hospitality-app/.env.local` (vazio/`SEU-PROJETO`) | portal em modo demonstração, sem sessão Supabase | copiar `.env.example` → `.env.local` e preencher URL + anon key |
| `PGPASSWORD` + `SUPABASE_DB_HOST` no ambiente | migrações/seeders Supabase `001..008` **não** correm | secret manager — nunca em ficheiros versionados |
| Projeto Supabase vivo | apps móveis ficam em modo demonstração | criar/ativar o projeto (`zqmtxxjoocwhaodlnhxg` **não resolve** — DNS falha) |
| Docker + Supabase CLI | não é possível correr o stack Supabase *local* nesta máquina (sem privilégios de admin) | ver nota abaixo |

**Nota sobre o Supabase local:** esta sessão corre **sem privilégios de
administrador** e sem Docker/WSL, por isso `supabase start` não é instalável de
forma autónoma (exige elevação/arranque). O `start-server` está programado para
o usar automaticamente caso o Docker + CLI apareçam; entretanto aplica as
migrações ao **SQLite local** (`hospitality_local.db`) e às bases remotas
quando lhe dão as credenciais.

**Nota sobre placeholders (mantidos de propósito):** o IBAN de demonstração é
`AO06 0000 …`. A app móvel o detecta (`isPlaceholderIban`) e **recusa enviar
instruções de pagamento** — é intencional. Idem para o número de telefone e
preçários. Substitua-os antes de operar a sério.

Para um build **operacional** e não de demonstração:
```bash
# 1. credenciais
$EDITOR hr-hospitality-app/.env.local      # NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
# 2. portal + Electron
start-server.bat --rebuild
node hr-hospitality-app/build_setups.js    # instalaadores ligados
# 3. apps
powershell -File .\build-android.ps1
```

---

## 8. Verificações efectuadas nesta entrega

| Verificação | Resultado |
| --- | --- |
| `next build` (16.3.6, Turbopack) | ✅ 32 páginas estáticas, TypeScript OK |
| Migrações SQLite `001..007` aplicadas à base local | ✅ versão 007 |
| Seeders SQLite executados e re-executados | ✅ idempotentes (8 reservas / 5 consumos / 4 colaboradores) |
| Perfis `POS` e `EXECUTIVO` inseridos em `app_users` | ✅ (bug do CHECK corrigido pela migração 007) |
| `check-migrations.mjs` (estrutura 001..008 + seeders) | ✅ **118/118 testes OK** |
| Electron Servidor + Cliente empacotados | ✅ 2 × 171,9 MB, assinados com signtool, atalho de área de trabalho |
| Smoke test do app Electron (`dist/win-unpacked`) | ✅ arrancou, ficou activo 14 s com processos GPU/rede/renderer e janela `HR-HOSPITALITY` |
| `out/` dentro de `app.asar` | ✅ 31 páginas HTML (`/out/index.html` incluída) — o `loadFile` do `main.js` encontra o ficheiro |
| Portal estático em `0.0.0.0:3000` | ✅ `/` 200 · `/download/` 200 · QR 200 · `.exe` 200 |
| `start-server.bat` ponta-a-ponta (migrações → seeders → banner → QR → downloads → servidor) | ✅ ligado no browser |
| `start-server.sh` ponta-a-ponta em Git Bash com `HR_PORT=3100` | ✅ servidor à escuta + área de download gerada |
| Portal renderizado no browser (`/` → `/login`) | ✅ formulário + aviso de modo demonstração |
| Página `/download/` renderizada no browser | ✅ 2 instaladores, tamanho, link directo e QR por ficheiro |
| `Cache-Control` de `/download/*` | ✅ `no-store` (um APK regenerado não fica preso na cache do telemóvel) |
| Área de download com QR | ✅ `out/download/index.html` |
| `.env`, `.env.local`, keystore e `dist/` fora do Git | ✅ `.gitignore` + `.gitattributes` |
| Nenhum segredo novo versionado | ✅ (keystore/password em `dist/keys/`, ignorado) |
| **Build Android dos 3 APKs** | ✅ `BUILD SUCCESSFUL in 21m`, 544 tarefas |
| Limites de caminho (42 `build.ninja`) | ✅ pior = **257** · **0** acima de 259 · 0 `still dirty` |
| `apksigner verify` nos 3 APKs | ✅ `CN=HRHospitalityDemo, OU=Demo, O=HRHospitality` |
| `.cxx` deixaram de ficar no repo | ✅ 9 → **0** (staging em `C:\hrb\…`) |
| `stage_downloads.mjs` sem argumentos | ✅ leu `HR_IP`/`HR_PORT` do `.env.local` → `http://192.0.0.14:3000/download/` |
| Grupo Android publicado | ✅ 3 APKs + 3 QR em `out/download/android/` |
| `HEAD /download/android/hr-client-app.apk` | ✅ `200` · `Content-Length: 71347382` · `Cache-Control: no-store` |
| `npm run start -- -H 0.0.0.0 -p 3000` | ✅ liga a `0.0.0.0` (flags `-H`/`-p` suportadas) |
| Firewall da porta 3000 | ✅ regra existente *Node.js → Allow → qualquer porta → Público/Privado* — sem elevação |
| Página de downloads no browser | ✅ 3 APKs com tamanho, link directo e QR |
| DNS do projeto Supabase `zqmtxxjoocwhaodlnhxg` | ✅ passou a resolver (`172.64.149.246`/`104.18.38.10`) e responde `401` em `/rest/v1/` — projecto **vivo** |
| Credenciais Supabase reais na máquina | ❌ **nenhuma** (verificado: CLI, Docker/WSL, env vars, Git, 1 437 bundles, QA reports, `~/.supabase`) |

---

## 9. Commits desta entrega

Repositório principal (`ricardo-60/HR-HOSPITALITY`, branch `main`), Conventional
Commits — **8 criados, todos por fazer push**:

| Hash | Âmbito |
| --- | --- |
| `99d1d4c` | `feat(admin):` páginas de financiais, KYC, comprovativos e economato |
| `902b1ae` | `feat(db):` catálogos públicos, núcleo comercial e POS no Supabase (migrações 006–008 + `create-reservation`) |
| `f67f370` | `feat(apps):` apps Expo de cliente, POS tablet e executiva (+ `eas.json`) |
| `3aa0d9f` | `feat(server):` arranque em 1 clique, seeders e área de download |
| `23ede63` | `feat(release):` scripts de build Android e iOS e normalização de EOL |
| `890b8ba` | `fix(server):` corrigir parsing do `start-server.bat` e concluir o teste de arranque |
| `a94ddaf` | `fix(android):` resolver o `MAX_PATH` do CMake mudando o staging para fora do repo |
| `f6fe998` | `feat(server):` apontar o servidor da LAN pelo `.env.local` e servir APKs com tamanho |

E este, que é apenas o próprio relatório (ainda não existia no Git):

| Ficheiro | Porquê |
| --- | --- |
| `docs/RELEASE_DEMO.md` | relatório da entrega — estado real dos artefactos, arranque 1-clique, links/QR da LAN e bloqueios |

> `gradle-init.gradle`, `build-android.ps1`, `start-server.*` e os dois scripts
> de `hr-hospitality-app/scripts/` já entraram nos commits `a94ddaf` e
> `f6fe998` acima.

Pendente de decisão: sincronizar com `ricardo-60/hotel-lukweku`
(`hotel-lukweku-repo/`, commit separado, como foi feito anteriormente).
