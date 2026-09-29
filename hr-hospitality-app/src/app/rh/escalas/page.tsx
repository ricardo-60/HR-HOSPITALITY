'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, CalendarDays, Plus, ArrowLeft, ArrowRight, Printer, Sun, Moon, Sunrise, X } from 'lucide-react';
import Link from 'next/link';

import {
    EscalasPrintSheet,
    SECTORES,
    SEM_SETOR,
    type FormatoImpressao,
} from '@/components/rh/EscalasPrintSheet';

type Turno = {
    id: string;
    nome: string;
    dia: string;
    tipo: string;
    horas: string;
    /** Setor do colaborador — é o que agrupa o resumo imprimível. */
    setor: string;
};

export const SEED_TURNOS: Turno[] = [
    { id: 'T-001', nome: 'Ricardo Ferreira', dia: 'Segunda', tipo: 'Manhã', horas: '08:00 - 16:30', setor: 'RECEPÇÃO' },
    { id: 'T-002', nome: 'Ana Sousa', dia: 'Terça', tipo: 'Tarde', horas: '16:00 - 00:30', setor: 'BAR' },
    { id: 'T-003', nome: 'João Silva', dia: 'Quarta', tipo: 'Noite', horas: '00:00 - 08:30', setor: 'SEGURANÇA' },
    { id: 'T-004', nome: 'Maria Conceição', dia: 'Quinta', tipo: 'Manhã', horas: '08:00 - 16:30', setor: 'LIMPEZA' },
    { id: 'T-005', nome: 'Carlos Pereira', dia: 'Sexta', tipo: 'Folga', horas: '---', setor: 'RESTAURANTE' },
];

/** Escalas guardadas antes da migração do setor continuam legíveis. */
function normalizar(lista: unknown[]): Turno[] {
    return lista
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map(item => ({
            id: String(item.id ?? ''),
            nome: String(item.nome ?? ''),
            dia: String(item.dia ?? 'Segunda'),
            tipo: String(item.tipo ?? 'Manhã'),
            horas: String(item.horas ?? ''),
            setor: typeof item.setor === 'string' && item.setor.trim() ? item.setor : SEM_SETOR,
        }))
        .filter(item => item.id && item.nome);
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_ESCOLHA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS = ['Manhã', 'Tarde', 'Noite', 'Folga'];

const HOURS_PLACEHOLDER: Record<string, string> = {
    'Manhã': '08:00 - 16:30',
    'Tarde': '16:00 - 00:30',
    'Noite': '00:00 - 08:30',
    'Folga': '---',
};

const segundaFeira = (offset: number) => {
    const d = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
};

export default function EscalasPage() {
    const [turnos, setTurnos] = useState<Turno[]>(SEED_TURNOS);
    const [semanaOffset, setSemanaOffset] = useState(0);
    const [vistaMes, setVistaMes] = useState(false);
    const [modal, setModal] = useState(false);
    const [erro, setErro] = useState('');
    const [form, setForm] = useState({ nome: '', dia: 'Segunda', tipo: 'Manhã', horas: '', setor: SECTORES[0] as string });
    const [formatoImpressao, setFormatoImpressao] = useState<FormatoImpressao | null>(null);
    const [impressoEm, setImpressoEm] = useState('');

    // Hydratação a partir do localStorage (seed com o array atual se vazio)
    useEffect(() => {
        const t = window.setTimeout(() => {
            try {
                const raw = localStorage.getItem('rh_escalas');
                const parsed = raw ? JSON.parse(raw) : null;
                if (Array.isArray(parsed) && parsed.length > 0) setTurnos(normalizar(parsed));
                else localStorage.setItem('rh_escalas', JSON.stringify(SEED_TURNOS));
            } catch { /* ignore */ }
        }, 0);
        return () => window.clearTimeout(t);
    }, []);

    // Escape fecha o modal
    useEffect(() => {
        if (!modal) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [modal]);

    const guardarTurnos = (lista: Turno[]) => {
        setTurnos(lista);
        try { localStorage.setItem('rh_escalas', JSON.stringify(lista)); } catch { /* ignore */ }
    };

    const getIcon = (tipo: string) => {
        if (tipo === 'Manhã') return <Sunrise className="w-5 h-5 text-[#F59E0B]" />;
        if (tipo === 'Tarde') return <Sun className="w-5 h-5 text-[#00F2FF]" />;
        if (tipo === 'Noite') return <Moon className="w-5 h-5 text-[#8B5CF6]" />;
        return null;
    };

    // Rótulos de semana/mês derivados do offset
    const segunda = segundaFeira(semanaOffset);
    const domingo = new Date(segunda);
    domingo.setDate(segunda.getDate() + 6);
    const labelSemana = segunda.getMonth() === domingo.getMonth()
        ? `Semana: ${segunda.getDate()} a ${domingo.getDate()} de ${MESES[domingo.getMonth()]}, ${domingo.getFullYear()}`
        : `Semana: ${segunda.getDate()} de ${MESES[segunda.getMonth()]} a ${domingo.getDate()} de ${MESES[domingo.getMonth()]}, ${domingo.getFullYear()}`;
    const labelMes = `Mês: ${MESES[segunda.getMonth()]} ${segunda.getFullYear()}`;

    const colaboradores = Array.from(new Set(turnos.map(t => t.nome)));

    /**
     * Prepara a folha e abre a caixa de impressão do navegador.
     *
     * A folha tem de estar no DOM antes de `window.print()`, por isso a troca
     * de estado acontece primeiro e o pedido de impressão vai no tick seguinte.
     */
    const imprimir = (formato: FormatoImpressao) => {
        setErro('');
        setFormatoImpressao(formato);
        setImpressoEm(new Date().toLocaleString('pt-PT'));
        window.setTimeout(() => { window.print(); }, 80);
    };

    const criarEscala = () => {
        const nome = form.nome.trim();
        if (!nome) { setErro('Indique o colaborador (escreva o nome ou escolha na lista).'); return; }
        if (form.tipo !== 'Folga' && !form.horas.trim()) { setErro('Indique as horas do turno (ex: 08:00 - 16:30).'); return; }
        const novo: Turno = {
            id: `T-${Date.now().toString().slice(-5)}`,
            nome,
            dia: form.dia,
            tipo: form.tipo,
            horas: form.tipo === 'Folga' ? '---' : form.horas.trim(),
            setor: form.setor || SEM_SETOR,
        };
        guardarTurnos([...turnos, novo]);
        setForm({ nome: '', dia: 'Segunda', tipo: 'Manhã', horas: '', setor: SECTORES[0] as string });
        setErro('');
        setModal(false);
    };

    // Grelha do mini-calendário mensal (mês da semana selecionada)
    const primeiroDia = new Date(segunda.getFullYear(), segunda.getMonth(), 1);
    const diasNoMes = new Date(segunda.getFullYear(), segunda.getMonth() + 1, 0).getDate();
    const lider = (primeiroDia.getDay() + 6) % 7;
    const celulas: (number | null)[] = [
        ...Array.from({ length: lider }, () => null),
        ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
    ];

    const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-bold focus:outline-none focus:border-[#F59E0B]/50 transition-all placeholder:text-white/20';
    const labelCls = 'block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2';

    return (
        <DashboardLayout>
            <div className="max-w-[1500px] mx-auto space-y-12 pb-20 px-4 print:hidden">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row justify-between items-end gap-8 border-b border-white/5 pb-8"
                >
                    <div>
                        <Link href="/rh" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6 font-bold uppercase tracking-widest text-[10px]">
                            <ArrowLeft className="w-4 h-4" /> Voltar ao Painel RH
                        </Link>
                        <h1 className="text-5xl font-black text-white tracking-tighter uppercase flex items-center gap-4">
                            <CalendarClock className="text-[#F59E0B]" /> Escalas &amp; Turnos
                        </h1>
                        <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                            Planeamento de Rosters e Alocação de Equipas
                        </p>
                    </div>

                    <div className="flex flex-col items-stretch gap-4 print:hidden">
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                            <span className="flex items-center gap-1.5 px-2 text-[9px] font-black uppercase tracking-widest text-white/40">
                                <Printer className="w-3.5 h-3.5" /> Imprimir
                            </span>
                            {([
                                ['A4', 'A4'],
                                ['SETOR', 'Por Setor'],
                                ['TERMICO', 'Térmico'],
                            ] as const).map(([valor, rotulo]) => (
                                <button
                                    key={valor}
                                    onClick={() => imprimir(valor)}
                                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
                                    title={
                                        valor === 'A4'
                                            ? 'Folha completa da semana em A4'
                                            : valor === 'SETOR'
                                                ? 'Resumo agrupado por setor em A4'
                                                : 'Bobina térmica de 80 mm'
                                    }
                                >
                                    {rotulo}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setVistaMes(v => !v)}
                                className="flex items-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                            >
                                <CalendarDays className="w-4 h-4" /> {vistaMes ? 'Ver Semana' : 'Ver Mês'}
                            </button>
                            <button
                                onClick={() => { setErro(''); setModal(true); }}
                                className="flex items-center gap-2 bg-[#F59E0B] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                            >
                                <Plus className="w-4 h-4" /> Criar Escala
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Semana / Mês View */}
                <div className="bg-[#111111] border border-white/5 rounded-[40px] p-8">
                    <div className="flex justify-between items-center mb-8 bg-white/5 p-4 rounded-2xl">
                        <button
                            onClick={() => setSemanaOffset(o => o - 1)}
                            aria-label="Semana anterior"
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest text-center">
                            {vistaMes ? labelMes : labelSemana}
                        </h2>
                        <button
                            onClick={() => setSemanaOffset(o => o + 1)}
                            aria-label="Semana seguinte"
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                        >
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>

                    {!vistaMes ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest">Colaborador</th>
                                        <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Seg</th>
                                        <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Ter</th>
                                        <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Qua</th>
                                        <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Qui</th>
                                        <th className="p-4 text-[10px] font-black text-white/40 uppercase tracking-widest text-center">Sex</th>
                                        <th className="p-4 text-[10px] font-black text-[#F43F5E] uppercase tracking-widest text-center">Sáb</th>
                                        <th className="p-4 text-[10px] font-black text-[#F43F5E] uppercase tracking-widest text-center">Dom</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {turnos.map((t, i) => (
                                        <motion.tr
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            key={t.id}
                                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                        >
                                            <td className="p-4">
                                                <p className="text-sm font-black text-white">{t.nome}</p>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mt-1">
                                                    {t.setor || SEM_SETOR}
                                                </p>
                                            </td>

                                            {/* Mocking a week for visual purposes */}
                                            {[1, 2, 3, 4, 5].map(day => (
                                                <td key={day} className="p-4 text-center">
                                                    {day === 3 && t.tipo === 'Folga' ? (
                                                        <span className="px-3 py-1 rounded-full text-[10px] font-black text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20">FOLGA</span>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center p-2 bg-white/5 rounded-xl border border-white/10 hover:border-white/30 cursor-pointer transition-colors">
                                                            {getIcon(t.tipo) || <Sun className="w-5 h-5 text-[#00F2FF]" />}
                                                            <span className="text-[9px] font-bold text-white/50 mt-1">{t.horas}</span>
                                                        </div>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="p-4 text-center"><span className="px-3 py-1 rounded-full text-[10px] font-black text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20">FOLGA</span></td>
                                            <td className="p-4 text-center"><span className="px-3 py-1 rounded-full text-[10px] font-black text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20">FOLGA</span></td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* Vista de Mês — mini calendário com turnos por dia da semana */
                        <div>
                            <div className="grid grid-cols-7 gap-3 mb-3">
                                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
                                    <div key={d} className={`text-center text-[10px] font-black uppercase tracking-widest ${i > 4 ? 'text-[#F43F5E]' : 'text-white/40'}`}>{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-3">
                                {celulas.map((d, i) => {
                                    if (d === null) return <div key={`empty-${i}`} />;
                                    const dow = DIAS_SEMANA[new Date(segunda.getFullYear(), segunda.getMonth(), d).getDay()];
                                    const doDia = turnos.filter(t => t.dia === dow);
                                    return (
                                        <div
                                            key={d}
                                            className={`min-h-[96px] rounded-2xl border p-3 ${doDia.length ? 'bg-white/5 border-white/20' : 'bg-white/[0.02] border-white/5'}`}
                                        >
                                            <span className="text-xs font-black text-white/60">{d}</span>
                                            <div className="mt-2 space-y-1">
                                                {doDia.map(t => (
                                                    <div key={t.id} className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1" title={`${t.nome} — ${t.tipo} ${t.horas}`}>
                                                        {getIcon(t.tipo) || <Sun className="w-3 h-3 text-[#00F2FF]" />}
                                                        <span className={`text-[9px] font-bold truncate ${t.tipo === 'Folga' ? 'text-[#F43F5E]' : 'text-white/70'}`}>
                                                            {t.tipo === 'Folga' ? 'FOLGA' : t.nome.split(' ')[0]}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Criar Escala */}
            <AnimatePresence>
                {modal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 print:hidden"
                        onClick={() => setModal(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-3xl p-8"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <Plus className="w-5 h-5 text-[#F59E0B]" /> Criar Escala
                                </h3>
                                <button
                                    onClick={() => setModal(false)}
                                    aria-label="Fechar"
                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className={labelCls}>Colaborador</label>
                                    <input
                                        list="escalas-colaboradores"
                                        value={form.nome}
                                        onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                                        placeholder="Escreva o nome ou escolha da lista"
                                        className={inputCls}
                                    />
                                    <datalist id="escalas-colaboradores">
                                        {colaboradores.map(n => <option key={n} value={n} />)}
                                    </datalist>
                                </div>

                                <div>
                                    <label className={labelCls}>Setor</label>
                                    <select
                                        value={form.setor}
                                        onChange={(e) => setForm(f => ({ ...f, setor: e.target.value }))}
                                        className={inputCls}
                                    >
                                        {[...SECTORES, SEM_SETOR].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Dia</label>
                                        <select
                                            value={form.dia}
                                            onChange={(e) => setForm(f => ({ ...f, dia: e.target.value }))}
                                            className={inputCls}
                                        >
                                            {DIAS_ESCOLHA.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Tipo</label>
                                        <select
                                            value={form.tipo}
                                            onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value, horas: '' }))}
                                            className={inputCls}
                                        >
                                            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className={labelCls}>Horas</label>
                                    <input
                                        type="text"
                                        disabled={form.tipo === 'Folga'}
                                        value={form.tipo === 'Folga' ? '---' : form.horas}
                                        onChange={(e) => setForm(f => ({ ...f, horas: e.target.value }))}
                                        placeholder={HOURS_PLACEHOLDER[form.tipo] || '08:00 - 16:30'}
                                        className={`${inputCls} disabled:opacity-40`}
                                    />
                                </div>

                                {erro && (
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/20 rounded-2xl px-4 py-3">
                                        {erro}
                                    </p>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={criarEscala}
                                        className="flex-1 bg-[#F59E0B] text-black px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all"
                                    >
                                        Guardar Escala
                                    </button>
                                    <button
                                        onClick={() => setModal(false)}
                                        className="bg-white/5 border border-white/10 text-white/60 hover:text-white px-6 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Folha de impressão: invisível no ecrã, única coisa no papel. */}
            {formatoImpressao ? (
                <EscalasPrintSheet
                    formato={formatoImpressao}
                    turnos={turnos}
                    rotulo={vistaMes ? labelMes : labelSemana}
                    impresso={impressoEm}
                />
            ) : null}
        </DashboardLayout>
    );
}
