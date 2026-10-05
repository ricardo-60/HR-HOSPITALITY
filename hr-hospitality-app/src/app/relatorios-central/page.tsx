'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import {
    BedDouble,
    ShoppingCart,
    FileText,
    Users,
    Download,
    Printer,
    Eye,
    ShieldCheck,
    BarChart3,
    CalendarDays,
    ArrowRight,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ReportCategory = {
    id: string;
    title: string;
    icon: React.ReactNode;
    color: string;
    reports: Report[];
};

type Report = {
    id: string;
    title: string;
    description: string;
    route: string;
    actions: ('view' | 'print' | 'download')[];
};

const CATEGORIES: ReportCategory[] = [
    {
        id: 'alojamento',
        title: 'Alojamento & Check-out',
        icon: <BedDouble className="w-6 h-6" />,
        color: '#00F2FF',
        reports: [
            {
                id: 'ocupacao',
                title: 'Ocupação & Faturamento',
                description: 'Taxa de ocupação, receita de diárias, RevPAR e origem/estado das reservas',
                route: '/relatorios?report=ocupacao',
                actions: ['view', 'print', 'download'],
            },
            {
                id: 'checkout-audit',
                title: 'Auditoria de Check-out',
                description: 'Extratos consolidados, logs transacionais e verificação de auditoria',
                route: '/alojamento',
                actions: ['view', 'print', 'download'],
            },
        ],
    },
    {
        id: 'pos-vendas',
        title: 'POS & Vendas',
        icon: <ShoppingCart className="w-6 h-6" />,
        color: '#40E0D0',
        reports: [
            {
                id: 'pos-consolidado',
                title: 'Vendas Consolidadas POS',
                description: 'Comandas liquidadas, ticket médio, produtos mais vendidos e formas de pagamento',
                route: '/relatorios?report=pos',
                actions: ['view', 'print', 'download'],
            },
            {
                id: 'caixas-pagamentos',
                title: 'Caixas & Formas de Pagamento',
                description: 'Distribuição por método de pagamento, sangrias e reconciliação de caixa',
                route: '/relatorios?report=pagamentos',
                actions: ['view', 'print', 'download'],
            },
            {
                id: 'produtos-vendidos',
                title: 'Top Produtos & Categorias',
                description: 'Ranking de produtos mais vendidos por categoria (pratos, bebidas, serviços)',
                route: '/relatorios?report=produtos',
                actions: ['view', 'print', 'download'],
            },
        ],
    },
    {
        id: 'auditoria',
        title: 'Auditoria & Logs',
        icon: <ShieldCheck className="w-6 h-6" />,
        color: '#FFD700',
        reports: [
            {
                id: 'auditoria-consolidada',
                title: 'Auditoria Operacional Consolidada',
                description: 'Rastro de auditoria completo, estado da licença e logs de integridade',
                route: '/relatorios?report=auditoria',
                actions: ['view', 'print', 'download'],
            },
            {
                id: 'logs-transacionais',
                title: 'Logs Transacionais',
                description: 'Histórico completo de operações com filtros por operador, data e módulo',
                route: '/relatorios?report=logs',
                actions: ['view', 'print', 'download'],
            },
        ],
    },
    {
        id: 'rh',
        title: 'Recursos Humanos',
        icon: <Users className="w-6 h-6" />,
        color: '#F59E0B',
        reports: [
            {
                id: 'escalas-turnos',
                title: 'Escalas & Turnos de Serviço',
                description: 'Planeamento semanal/mensal, resumo por setor e impressão A4/Térmica',
                route: '/rh/escalas',
                actions: ['view', 'print', 'download'],
            },
            {
                id: 'presencas-picagem',
                title: 'Presenças & Picagem',
                description: 'Registos de entrada/saída, horas trabalhadas e faltas justificadas',
                route: '/rh/picagem',
                actions: ['view', 'print', 'download'],
            },
            {
                id: 'custos-salariais',
                title: 'Custos Salariais & Processamento',
                description: 'Folhas de salário, horas extra, subsídios e encargos patronais',
                route: '/rh/salarios',
                actions: ['view', 'print', 'download'],
            },
        ],
    },
];

const ACTION_LABELS: Record<string, string> = {
    view: 'Visualizar',
    print: 'Imprimir',
    download: 'Baixar',
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
    view: <Eye className="w-4 h-4" />,
    print: <Printer className="w-4 h-4" />,
    download: <Download className="w-4 h-4" />,
};

function ReportCard({ report }: { report: Report }) {
    const [expanded, setExpanded] = useState(false);
    const router = useRouter();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group bg-[#111111] border border-white/10 rounded-2xl overflow-hidden transition-all hover:border-white/30"
        >
            <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">{report.title}</h3>
                        <p className="text-white/50 text-sm leading-relaxed">{report.description}</p>
                    </div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors flex-shrink-0"
                        aria-label={expanded ? 'Recolher ações' : 'Expandir ações'}
                    >
                        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                </div>

                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: expanded ? 1 : 0, height: expanded ? 'auto' : 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                >
                    <div className="pt-4 border-t border-white/5 flex flex-wrap gap-3">
                        {report.actions.map((action) => (
                            <button
                                key={action}
                                onClick={() => {
                                    if (action === 'view') router.push(report.route);
                                    else if (action === 'print') {
                                        router.push(report.route);
                                        setTimeout(() => window.print(), 500);
                                    } else if (action === 'download') {
                                        router.push(`${report.route}?download=true`);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/80 text-xs font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/30 hover:text-white transition-all"
                            >
                                {ACTION_ICONS[action]} {ACTION_LABELS[action]}
                            </button>
                        ))}
                        <Link
                            href={report.route}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F59E0B] to-[#F59E0B]/80 text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-all"
                        >
                            <ArrowRight className="w-4 h-4" /> Abrir Módulo
                        </Link>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

function CategorySection({ category, index }: { category: ReportCategory; index: number }) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="space-y-6"
        >
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                <div
                    className="p-3 rounded-xl bg-gradient-to-br"
                    style={{ background: `linear-gradient(135deg, ${category.color}20, ${category.color}40)` }}
                >
                    <span style={{ color: category.color }}>{category.icon}</span>
                </div>
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-wider">{category.title}</h2>
                    <p className="text-white/40 text-sm uppercase tracking-widest">{category.reports.length} relatórios disponíveis</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.reports.map((report) => (
                    <ReportCard key={report.id} report={report} />
                ))}
            </div>
        </motion.section>
    );
}

export default function RelatoriosCentralPage() {
    return (
        <DashboardLayout>
            <div className="max-w-[1600px] mx-auto space-y-16 pb-24 px-4">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 border-b border-white/10 pb-8"
                >
                    <div>
                        <Link href="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6 font-bold uppercase tracking-widest text-[10px]">
                            <ChevronDown className="w-4 h-4" /> Voltar ao Dashboard
                        </Link>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-xl bg-gradient-to-br from-[#00F2FF]20 to-[#FFD700]20 border border-[#00F2FF]/30">
                                <FileText className="w-8 h-8 text-[#00F2FF]" />
                            </div>
                            <div>
                                <h1 className="text-5xl font-black text-white tracking-tighter uppercase">
                                    Central de <span className="text-[#00F2FF]">Relatórios</span>
                                </h1>
                                <p className="text-white/30 font-black uppercase tracking-[0.3em] text-[10px] mt-2">
                                    Acesso unificado a todos os relatórios gerenciais e operacionais
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/50 text-[10px] font-black uppercase tracking-widest">
                            <CalendarDays className="w-4 h-4" />
                            <span id="current-date"></span>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                    <StatCard icon={<BedDouble className="w-5 h-5" />} label="Alojamento" value="4" sub="Relatórios" color="#00F2FF" />
                    <StatCard icon={<ShoppingCart className="w-5 h-5" />} label="POS & Vendas" value="3" sub="Relatórios" color="#40E0D0" />
                    <StatCard icon={<ShieldCheck className="w-5 h-5" />} label="Auditoria" value="2" sub="Relatórios" color="#FFD700" />
                    <StatCard icon={<Users className="w-5 h-5" />} label="Recursos Humanos" value="3" sub="Relatórios" color="#F59E0B" />
                </motion.div>

                {/* Categories */}
                <div className="space-y-16">
                    {CATEGORIES.map((cat, i) => (
                        <CategorySection key={cat.id} category={cat} index={i} />
                    ))}
                </div>

                {/* Footer CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="border border-white/10 rounded-2xl p-8 bg-gradient-to-r from-white/5 via-transparent to-white/5"
                >
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
                        <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-2">
                                Precisa de um relatório personalizado?
                            </h3>
                            <p className="text-white/50">
                                A equipa técnica pode criar relatórios sob medida para as suas necessidades específicas.
                            </p>
                        </div>
                        <Link
                            href="/configuracoes"
                            className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#00F2FF] to-[#40E0D0] text-black font-black text-sm uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_10px_30px_rgba(0,242,255,0.3)]"
                        >
                            <BarChart3 className="w-5 h-5" /> Solicitar Relatório Customizado
                        </Link>
                    </div>
                </motion.div>
            </div>

            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        document.getElementById('current-date').textContent = new Date().toLocaleDateString('pt-PT', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                        });
                    `,
                }}
            />
        </DashboardLayout>
    );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
    return (
        <div className="group p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-white/30 hover:bg-white/10 transition-all">
            <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl" style={{ background: `${color}20` }}>
                    <span style={{ color }}>{icon}</span>
                </div>
                <div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{label}</p>
                    <p className="text-2xl font-black text-white tracking-tighter">{value}</p>
                </div>
            </div>
            <p className="text-white/40 text-sm uppercase tracking-widest">{sub}</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-transparent group-hover:bg-current group-hover:opacity-100 transition-all duration-300" style={{ background: color }} />
        </div>
    );
}