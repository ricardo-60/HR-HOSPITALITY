/* eslint-disable */
'use client';

/**
 * HR-HOSPITALITY — VoiceInput
 * Botão de microfone reutilizável: grava com MediaRecorder e envia o áudio,
 * através do IPC seguro do Electron, para o motor faster-whisper local.
 *
 * USO:
 *   <VoiceInput onText={(t) => setNotes((prev) => (prev ? prev + ' ' + t : t))} />
 *   <VoiceInput onText={setNotes} language="pt" compact />
 */

import { useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceInputProps {
    /** Recebe o texto transcrito (anexar ao campo de destino). */
    onText: (text: string) => void;
    /** Idioma preferido (omissão: pt). Use 'auto' para deteção automática. */
    language?: string;
    /** Variante compacta (só ícone, sem rótulo). */
    compact?: boolean;
    className?: string;
}

type VoiceState = 'idle' | 'recording' | 'processing';

export default function VoiceInput({ onText, language = 'pt', compact = false, className = '' }: VoiceInputProps) {
    const [state, setState] = useState<VoiceState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [seconds, setSeconds] = useState(0);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Falha ao preparar áudio.'));
        reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.readAsDataURL(blob);
    });

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunksRef.current = [];

            const mimeType = MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : MediaRecorder.isTypeSupported('audio/mp4')
                    ? 'audio/mp4'
                    : '';

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
                if (blob.size > 0) transcribe(blob);
                else setState('idle');
            };

            recorder.start();
            setState('recording');
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        } catch (e: any) {
            setState('idle');
            if (e?.name === 'NotAllowedError') {
                setError('Permissão de microfone negada.');
            } else {
                setError('Microfone indisponível: ' + (e?.message || e));
            }
        }
    };

    const stopRecording = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        recorderRef.current?.stop();
    };

    const transcribe = async (blob: Blob) => {
        setState('processing');
        try {
            const voiceBridge = typeof window !== 'undefined'
                ? (window as any).electronAPI?.voice
                : null;
            if (!voiceBridge || typeof voiceBridge.transcribe !== 'function') {
                throw new Error('A transcrição está disponível apenas na aplicação Electron Servidor.');
            }
            const data = await voiceBridge.transcribe(await blobToBase64(blob), language);
            const text = String(data?.text || '').trim();
            if (text) onText(text);
            else setError('Nenhuma fala detetada no áudio.');
        } catch (error: any) {
            setError(error?.message || 'Falha na transcrição.');
        } finally {
            setState('idle');
        }
    };

    const handleClick = () => {
        if (state === 'idle') startRecording();
        else if (state === 'recording') stopRecording();
    };

    const stateStyles =
        state === 'recording'
            ? 'bg-red-500/20 border-red-500/60 text-red-400 animate-pulse'
            : state === 'processing'
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-[#00F2FF] hover:border-[#00F2FF]/40';

    const stateLabel =
        state === 'recording'
            ? `A gravar... ${seconds}s (clique para parar)`
            : state === 'processing'
                ? 'A transcrever...'
                : 'Ditar por voz';

    return (
        <div className={`inline-flex items-center gap-2 ${className}`}>
            <button
                type="button"
                onClick={handleClick}
                disabled={state === 'processing'}
                title={stateLabel}
                aria-label={stateLabel}
                className={`flex items-center justify-center border rounded-xl transition-all disabled:opacity-60 ${stateStyles} ${
                    compact ? 'w-9 h-9' : 'px-4 py-3 gap-2'
                }`}
            >
                {state === 'processing' ? (
                    <Loader2 className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} animate-spin`} />
                ) : state === 'recording' ? (
                    <Square className="w-3.5 h-3.5" />
                ) : (
                    <Mic className={compact ? 'w-4 h-4' : 'w-4 h-4'} />
                )}
                {!compact && (
                    <span className="text-[9px] font-black uppercase tracking-widest">
                        {state === 'recording' ? `Gravar ${seconds}s` : state === 'processing' ? 'A transcrever' : 'Ditar'}
                    </span>
                )}
            </button>

            {!compact && error && (
                <span className="text-[10px] font-bold text-red-400/90 max-w-[220px] leading-tight">{error}</span>
            )}
            {compact && error && (
                <span title={error} className="text-[10px] font-bold text-red-400/90">!</span>
            )}
        </div>
    );
}
