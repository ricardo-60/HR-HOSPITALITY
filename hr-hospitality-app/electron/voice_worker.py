#!/usr/bin/env python3
"""
HR-HOSPITALITY — Voice Worker (faster-whisper)
Chamado pelo servidor local Express (electron/server.js) no endpoint
POST /api/voice/transcribe.

USO:
    python voice_worker.py <ficheiro_audio> [idioma]

Saída: JSON em stdout — {"text": "...", "language": "pt", "confidence": 0.97}
Erros: mensagem em stderr + exit code != 0.
"""
import json
import math
import sys


def main():
    if len(sys.argv) < 2:
        print("Uso: python voice_worker.py <audio> [idioma]", file=sys.stderr)
        sys.exit(2)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "pt"
    language = None if language in ("", "auto") else language

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper não instalado. Execute: pip install faster-whisper", file=sys.stderr)
        sys.exit(3)

    # small = bom equilíbrio precisão/velocidade em CPU (int8)
    model = WhisperModel("small", device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        beam_size=5,
    )

    texts = []
    confidences = []
    for seg in segments:
        t = seg.text.strip()
        if t:
            texts.append(t)
            # avg_logprob é log-probabilidade → converter para [0..1]
            confidences.append(math.exp(seg.avg_logprob))

    result = {
        "text": " ".join(texts),
        "language": info.language,
        "confidence": round(sum(confidences) / len(confidences), 3) if confidences else 0.0,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
