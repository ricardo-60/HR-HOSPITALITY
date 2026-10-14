# Relatório Técnico de Viabilidade — Videoestratégia (CCTV) + Iluminação Pública Inteligente (IoT/NMS)

> **Projeto:** HR-HOSPITALITY — Expansão módulos CCTV & Smart Lighting
> **Data:** 13/10/2026
> **Análise de:** `blakeblackshear/frigate` (36.5k ★) e `thingsboard/thingsboard` (22.5k ★)
> **Repositórios clonados em:** `C:\Users\HP\Desktop\Desenvolver\_reference-repos\`

---

## 1. Sumário Executivo

Foram mapeados ~40 repositórios em duas varreduras no GitHub. O achado central de arquitetura:

> **Não existe NVR open-source maduro com módulo de iluminação embutido, nem plataforma IoT open-source madura com VMS embutido.** Os dois domínios são ecossistemas distintos. A arquitetura correta é **compor**: um NVR dedicado para vídeo + uma plataforma IoT para iluminação, integrados por MQTT e um painel unificado.

**Recomendação:** Frigate (vídeo/AI) + ThingsBoard (iluminação/telemetria) + MQTT como barramento.

| Criterio | Frigate | ThingsBoard |
|---|---|---|
| **Papel** | NVR + detecção de objetos em tempo real | Plataforma IoT (device mgmt, telemetria, dashboards) |
| **Stars** | 36.548 | 22.545 |
| **Linguagem** | Python 3.11 + React | Java 25 + Angular 20 |
| **Licenca** | MIT | Apache 2.0 (CE) |
| **Runtime** | Docker (Linux) | Docker ou fonte (Java) |
| **Banco** | SQLite/Peewee embutido | PostgreSQL |
| **Protocolo chave** | ONVIF, RTSP, MQTT | MQTT, HTTP, CoAP, LwM2M, SNMP, OPC-UA |
| **Maturidade** | Excelente — padrão de facto em NVR doméstico/pme | Excelente — líder IoT open-source |

---

## 2. Analise de Arquitetura

### 2.1 Frigate (`_reference-repos\frigate`, 108 MB)

**Stack tecnologica:**
- **Backend:** Python 3.11 (confere com `tflite_runtime cp311`), base Debian 12
- **API:** FastAPI 0.142 + Uvicorn 0.54 + Starlette 1.7 (assíncrono)
- **Frontend:** React + Radix UI + react-hook-form + `@rjsf` (forms dinâmicos), player `jsmpeg`
- **Persistencia:** Peewee ORM 4.5 + `peewee_migrate` (SQLite embutido — sem setup de banco)
- **Streaming:** `go2rtc` embutido (gateway RTSP/WebRTC), FFmpeg

**Pilha de detecção de IA (suporte multi-acelerador):**
| Acelerador | Dependencia | Hardware |
|---|---|---|
| CPU | `tensorflow-cpu 2.21` | Qualquer x86_64 |
| Intel GPU | `openvino 2025.4` | iGPU HD (`/dev/dri`) |
| NVIDIA | TensorRT (Dockerfile dedicado) | GPU NVIDIA |
| Edge | TFLite 2.17.1, Coral USB | Google Coral |
| NPU | HailoRT | Hailo-8 |

**Modulos relevantes ao escopo:**
- `onvif-zeep-async 4.3` → descoberta e controle de câmeras ONVIF nativamente
- `paho-mqtt 2.1` → integração MQTT (ponte para ThingsBoard)
- `norfair 2.3` → tracking de objetos entre frames
- `transformers 5.19`, `faster-whisper`, `sherpa-onnx` → análise de áudio/transcrição
- `google-genai`, `ollama`, `openai` → análise generativa de vídeo (VLM)
- **Deteccao de veiculos/pessoas** incluída (labelmap padrão), **LPR** (`pyclipper`, `shapely`) para reconhecimento de placas

**Suporte de hardware acelerador no `docker-compose.yml`:** Google Coral USB, Intel `/dev/dri`, NVIDIA (bloco `deploy` comentado para habilitar).

### 2.2 ThingsBoard (`_reference-repos\thingsboard`, 234 MB)

**Stack tecnologica:**
- **Backend:** Java **25** (`maven.compiler.source: 25`), Maven multi-módulo (~13.8k arquivos)
- **Frontend:** Angular 20.3.28 + NgRx 20 + RxJS 7.8 (arquitetura reativa fluxo único)
- **Banco:** **PostgreSQL** (único driver em `dao/pom.xml` — H2 p/ dev)
- **Fila/Transporte:** `netty-mqtt` (broker MQTT embutido p/ device-side)

**Modulos de integracao (northbound):** `mqtt`, `http`, `coap`, `opc-ua`, `kafka`, `rabbitmq`, `apache-pulsar`, `aws`, `azure`, `pubsub`, `tcp-udp`, `tuya`

**Transportes device-side:** `mqtt`, `http`, `coap`, `lwm2m`, `snmp`

> Para iluminação pública: luminárias com firmware MQTT/LoRaWAN se conectam via broker externo (Mosquitto/ChirpStack) → ThingsBoard ingere por `mqtt-integration` → regras (`rule-engine`) → dashboards georreferenciados (`ui-ngx` com OpenStreetMap).

---

## 3. Blueprints de Integracao Video + Iluminacao

### 3.1 Barramento unificado (MQTT)
```
Câmeras ONVIF/RTSP ──► Frigate ──► eventos MQTT ──┐
                                                    ├──► Mosquitto ──► ThingsBoard (regras/painel)
Luminárias MQTT/LoRa ──► ChirpStack ───────────────┘                      │
                                                                            ▼
                                                              Dashboard único (iframe/API)
```

### 3.2 Cenarios de integracao concreta
1. **Alerta iluminacao por evento de video:** Frigate publica `frigate/events/person` no tópico MQTT → ThingBoard rule engine aciona luminária do setor via comando downlink.
2. **Iluminacao de emergencia em intrusion:** detecção de pessoa/página após horário → regra liga iluminação + grava clipe (Frigate já grava por evento).
3. **Telemetria energetica das luminárias:** cada poste publica consumo/estado em `telemetry` → ThingsBoard agrega e gera relatório de eficiência.
4. **Georreferenciamento:** cadastro de dispositivos com lat/lon no ThingsBoard → mapa de postes + overlay de status; Frigate adiciona miniaturas de câmera por ponto.

### 3.3 Alternativa "tudo-em-um" avaliada e descartada
- **ZoneMinder (5.9k ★):** maduro, mas stack PHP/Apache legada, sem IA nativa, sem plataforma IoT. Pior integrabilidade.
- **Shinobi (1.4k ★):** Node.js, mas licença CE restritiva p/ uso comercial, sem módulo IoT.
- **Conclusao:** Frigate + ThingsBoard oferecem a melhor combinação maturidade + IA + IoT + licença permissiva (MIT/Apache).

---

## 4. Viabilidade no Host Atual (HP 280 G2 MT)

| Recurso | Host atual | Frigate | ThingsBoard | Veredicto |
|---|---|---|---|---|
| CPU | Pentium G4400 (2C/2T) | Python/TensorFlow CPU — pesado | JVM — aceitável | ⚠️ limitante p/ Frigate |
| RAM | **15,9 GB** | ~2–4 GB p/ poucas câmeras | ~4 GB min (recom. 8) | ✅ viável |
| GPU | Intel HD 510 | OpenVINO (fraco, GT1) | n/a | ⚠️ usar CPU p/ poucos canais |
| SO | **Windows 10** | Docker (Linux) necessário | Java 21 instalado ⚠️ | ⚠️ Frigate exige Docker/WSL |
| Docker | ausente | obrigatório | opcional | ❌ instalar |
| Java | 21 (Adoptium) | — | requer **25** | ⚠️ atualizar JDK |
| Node | presente | build do `web/` | build `ui-ngx` | ✅ |
| Python | 3.11 presente | confere (cp311) | — | ✅ |

**Conclusao de viabilidade:**
- **ThingsBoard (iluminação):** ✅ **Totalmente viável** neste host. Basta atualizar JDK para 25 e subir PostgreSQL. Pode rodar nativo (Maven) ou via Docker.
- **Frigate (vídeo):** ⚠️ **Viável com ressalvas.** É projeto **Linux/Docker-first**; no Windows requer Docker Desktop (WSL2). Com 2C/2T e HD 510 (OpenVINO GT1), o desempenho de detecção AI fica limitado a **poucos canais** (~4–8 câmeras em detecção reduzida). Recomenda-se servidor dedicado Linux para produção com mais câmeras.
- **Producao real (campo militar/Grafanil):** para dezenas de postes + câmeras, prever **servidor Linux dedicado** (ex.: Xeon/EPYC + GPU ou Coral). O host atual serve para **desenvolvimento e POC**.

---

## 5. Comandos de Inicializacao

### 5.1 Frigate (via Docker — caminho suportado)
```powershell
# 1) Instalar Docker Desktop (WSL2 backend)
winget install Docker.DockerDesktop
# 2) Reiniciar e iniciar o daemon
Start-Service com.docker.service   # ou abrir Docker Desktop
# 3) Subir stack de desenvolvimento (Frigate + Mosquitto)
cd C:\Users\HP\Desktop\Desenvolver\_reference-repos\frigate
docker compose up -d
# 4) UI de desenvolvimento do Frigate
cd web && npm install && npm run dev   # http://localhost:5173
```

### 5.2 ThingsBoard (via Docker — caminho mais rapido)
```powershell
cd C:\Users\HP\Desktop\Desenvolver\_reference-repos\thingsboard
# Usar docker-compose oficial do projeto em msa/
docker compose -f msa/docker-compose.yml up -d
# UI: http://localhost:8080  (login: tenant@thingsboard.org / tenant)
```

### 5.3 ThingsBoard (via fonte — requer JDK 25 + Maven)
```powershell
# 1) Atualizar JDK para 25 (Adoptium)
winget install EclipseAdoptium.Temurin.25.JDK
# 2) Instalar Maven
winget install Apache.Maven
# 3) Build (pula UI para ser mais rapido)
cd C:\Users\HP\Desktop\Desenvolver\_reference-repos\thingsboard
mvn clean install -DskipTests -Dprofile=-skip-pkg-without-ui-build
# 4) Executar (requer PostgreSQL em localhost:5432, db thingsboard)
mvn -pl application spring-boot:run
```

### 5.4 Barramento MQTT compartilhado
```powershell
docker run -d --name mosquitto -p 1883:1883 eclipse-mosquitto:2.0
```

---

## 6. Primeiros Passos de Customizacao

### 6.1 Frigate — configurar câmeras
Criar `config/config.yml`:
```yaml
mqtt:
  host: 192.168.0.10      # IP do Mosquitto (integrar c/ ThingsBoard)
  enabled: true
  topic_prefix: frigate
cameras:
  portaria_geral:
    ffmpeg:
      inputs:
        - path: rtsp://usuario:senha@192.168.0.50:554/stream1
          roles: [detect, record]
    detect:
      width: 1280
      height: 720
      fps: 5
    objects:
      track: [person, car, motorcycle]
```
- Pontos de customização: `frigate/config.py` (validação), `frigate/object_detection/` (backends), `frigate/video/` (pipeline).
- Para este host Intel: habilitar `openvino` em `detectors.openvino.device: CPU`.

### 6.2 ThingsBoard — provisionar dispositivos de iluminação
1. **Device profile** `luminaria-mqtt` com telemetria `estado`, `consumo_w`, `dimmer`.
2. **Integracao MQTT:** `Integrations → + → MQTT`, broker `mosquitto:1883`, mapear tópico `luminaria/+/telemetry`.
3. **Rule engine:** fluxo `Telemetry → Switch (consumo > limiar) → RPC "setPower"`.
4. **Dashboard georreferenciado:** widget **Maps** (OpenStreetMap) com `entityView` dos dispositivos; coordenadas do campo militar/Grafanil.
5. Pontos de customização: `ui-ngx/src/app/` (Angular), `rule-engine/` (nós custom), `common/data` (modelo de entidade).

### 6.3 Integracao Frigate → ThingsBoard
- Em Frigate, publicar evento no tópico: `frigate/events/person` (já nativo).
- Em ThingsBoard, criar **Rule Chain** `inbound`: filtro por tópico `frigate/#` → `script` (converter JSON) → `telemetry` num device `cctv-gateway`, ou **RPC downlink** para luminária.
- Fluxo inverso (iluminação → gravação): rule engine publica comando MQTT `frigate/...` para forçar gravação contínua da câmera do setor.

---

## 7. Roadmap Sugerido

| Fase | Entrega | Esforco |
|---|---|---|
| 1 | Docker + Mosquitto + ThingsBoard funcional (POC iluminação) | 1–2 dias |
| 2 | Frigate com 2 câmeras RTSP, detecção CPU/OpenVINO | 2–3 dias |
| 3 | Integração MQTT Frigate↔ThingsBoard + dashboard unificado | 3–5 dias |
| 4 | Georreferenciamento + regras de iluminação por evento | 1 semana |
| 5 | Deploy produção em servidor Linux dedicado + LoRaWAN (ChirpStack) | 2+ semanas |

---

## 8. Referencias Locais
- Frigate: `_reference-repos\frigate\` (ver `docker-compose.yml`, `docker/main/requirements-wheels.txt`, `docs/`)
- ThingsBoard: `_reference-repos\thingsboard\` (ver `pom.xml`, `ui-ngx/`, `integration/`, `transport/`)
- Compatibilidade de hardware Frigate: `docs/configuration/accelerators.md`
