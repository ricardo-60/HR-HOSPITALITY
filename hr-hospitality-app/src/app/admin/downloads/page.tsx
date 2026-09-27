'use client';

import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { Ban, Download, Smartphone, Users } from 'lucide-react';

/**
 * Central de Descargas (restrita a ADMINISTRATOR).
 *
 * Os APKs vivem em `out/download/android/` (copiados por
 * `scripts/stage_downloads.mjs` a partir de `dist/android/`) e são servidos
 * pelo `scripts/serve_static.mjs` com o MIME `.apk` correcto. Por isso os
 * links abaixo são relativos ao próprio portal.
 *
 * Os QR são gerados em runtime — nunca em `useState` síncrono dentro de um
 * `useEffect` (regra `react-hooks/set-state-in-effect`): o SVG é escrito por
 * referência, depois da Promise resolver.
 */
interface DownloadItem {
    key: string;
    audience: string;
    file: string;
    path: string;
    description: string;
    size: string;
    icon: typeof Download;
    accent: string;
}

const DOWNLOAD_ITEMS: DownloadItem[] = [
    {
        key: 'pos',
        audience: 'Recepção / POS',
        file: 'hr-pos-app.apk',
        path: '/download/android/hr-pos-app.apk',
        description:
            'Ponto de venda, comandas e leitura de reservas em tempo real. Instalar nos postos da recepção/restauração e nos telemóveis da equipa.',
        size: '56,3 MB',
        icon: Smartphone,
        accent: 'var(--brand-primary)',
    },
    {
        key: 'executive',
        audience: 'Proprietários / Executivo',
        file: 'hr-executive-app.apk',
        path: '/download/android/hr-executive-app.apk',
        description:
            'Visão integral de todos os módulos, só de leitura, ligada à mesma sessão Supabase do painel.',
        size: '56,2 MB',
        icon: Users,
        accent: 'var(--brand-accent)',
    },
];

/** Desenha o QR de `path` (URL absoluta calculada no cliente) numa caixa branca. */
function QrBox({ path, label }: { path: string; label: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const absolute = window.location.origin + path;

        QRCode.toString(absolute, {
            type: 'svg',
            margin: 2,
            width: 320,
            errorCorrectionLevel: 'M',
        })
            .then((svg) => {
                if (!cancelled && boxRef.current) boxRef.current.innerHTML = svg;
            })
            .catch((err) => {
                console.warn('QR indisponível (' + path + '):', err);
            });

        return () => {
            cancelled = true;
        };
    }, [path]);

    return (
        <div
            ref={boxRef}
            role="img"
            aria-label={label}
            className="w-44 h-44 sm:w-48 sm:h-48 bg-white p-3 rounded-2xl shrink-0"
        />
    );
}

export default function AdminDownloadsPage() {
    const { user } = useAuth();

    // Apenas administradores — o DashboardLayout já filtra, mas mantemos a
    // guarda em camadas igual à página de controlo de acessos.
    if (user?.role !== 'ADMINISTRATOR') {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-6">
                    <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full">
                        <Ban className="w-12 h-12" />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h2>
                    <p className="text-white/40 max-w-md uppercase tracking-wider text-xs font-black">
                        Apenas utilizadores administradores têm permissão para aceder à central de descargas.
                    </p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-16 pb-20 px-4">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-1.5 h-6 bg-[var(--brand-primary)] shadow-[0_0_15px_var(--brand-primary)]" />
                            <span className="text-[10px] font-black text-[var(--brand-accent)] uppercase tracking-[0.6em]">
                                DNA HR-HOSPITALITY • Administrador
                            </span>
                        </div>
                        <h1 className="text-5xl font-black text-white tracking-tighter uppercase">
                            CENTRAL DE <span className="text-[var(--brand-accent)]">DESCARGAS</span>
                        </h1>
                        <p className="text-white/20 font-black uppercase tracking-[0.4em] text-[10px] mt-4">
                            APKs oficiais das apps internas — links directos e QR codes para instalação rápida
                        </p>
                    </div>
                    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10">
                        <Download className="w-4 h-4 text-[var(--brand-accent)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
                            {DOWNLOAD_ITEMS.length} artefactos Android
                        </span>
                    </div>
                </div>

                {/* Download cards */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {DOWNLOAD_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <section
                                key={item.key}
                                aria-labelledby={`dl-${item.key}`}
                                className="glass-panel p-8 rounded-[40px] border border-white/5 shadow-2xl relative"
                            >
                                <div
                                    className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent"
                                    aria-hidden="true"
                                />

                                <div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center">
                                    <div className="flex-1 min-w-0 space-y-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                                                <Icon className="w-5 h-5" style={{ color: item.accent }} />
                                            </div>
                                            <span
                                                className="text-[9px] font-black uppercase tracking-[0.3em]"
                                                style={{ color: item.accent }}
                                            >
                                                {item.audience}
                                            </span>
                                        </div>

                                        <h2
                                            id={`dl-${item.key}`}
                                            className="text-2xl font-black uppercase tracking-tight text-white break-all"
                                        >
                                            {item.file}
                                        </h2>

                                        <p className="text-xs text-white/40 leading-relaxed uppercase tracking-wider font-bold">
                                            {item.description}
                                        </p>

                                        <div className="flex flex-wrap items-center gap-3">
                                            <a
                                                href={item.path}
                                                download
                                                className="min-h-[52px] inline-flex items-center gap-2 px-7 py-4 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-accent)] text-white font-black text-[11px] uppercase tracking-widest rounded-2xl hover:brightness-110 active:scale-95 transition-all"
                                            >
                                                <Download className="w-4 h-4" /> Descarregar
                                            </a>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/30 px-4 py-3 border border-white/10 rounded-2xl">
                                                {item.size} • Android 8+
                                            </span>
                                        </div>

                                        <p className="text-[10px] font-mono text-white/30 break-all">
                                            {item.path}
                                        </p>
                                    </div>

                                    <div className="flex flex-col items-center gap-3 self-center">
                                        <QrBox
                                            path={item.path}
                                            label={`Código QR para transferir ${item.file}`}
                                        />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                                            Aponte a câmara
                                        </span>
                                    </div>
                                </div>
                            </section>
                        );
                    })}
                </div>

                {/* Notes */}
                <div className="glass-panel p-8 rounded-[40px] border border-white/5 shadow-2xl space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-[var(--brand-accent)]">
                        Notas de instalação
                    </h3>
                    <ul className="text-[11px] text-white/40 uppercase tracking-wider font-bold space-y-2 leading-relaxed">
                        <li>
                            • O QR codifica o endereço do portal em uso — na rede local aponte para o IP do servidor,
                            para o telemóvel transferir directamente.
                        </li>
                        <li>
                            • Android: ao abrir o APK, permita &ldquo;instalar de fontes desconhecidas&rdquo; para o
                            navegador.
                        </li>
                        <li>
                            • Os ficheiros são servidos por <code className="text-white/60">serve_static.mjs</code> com
                            o Content-Type <code className="text-white/60">application/vnd.android.package-archive</code>.
                        </li>
                    </ul>
                </div>
            </div>
        </DashboardLayout>
    );
}
