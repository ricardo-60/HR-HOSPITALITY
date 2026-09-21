'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    BarChart3, Home, Store, Settings, Package, ShieldCheck,
    Users, Building2, Heart, Lock, LogOut, UserCheck, X, BookOpen
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const menuItems = [
    { name: 'DASHBOARD', icon: BarChart3, path: '/', category: 'CORE' },
    { name: 'ALOJAMENTO', icon: Home, path: '/alojamento', category: 'HOSPITALITY' },
    { name: 'RESTAURAÇÃO', icon: Store, path: '/pos', category: 'HOSPITALITY' },
    { name: 'SNACK BAR', icon: Store, path: '/snack-bar', category: 'HOSPITALITY' },
    { name: 'EVENTOS', icon: Building2, path: '/eventos', category: 'HOSPITALITY' },
    { name: 'BEM-ESTAR E LAZER', icon: Heart, path: '/spa', category: 'WELLNESS' },
    { name: 'LAVANDARIA', icon: Package, path: '/lavandaria', category: 'OPERATIONS' },
    { name: 'TRANSFER', icon: ShieldCheck, path: '/transfer', category: 'OPERATIONS' },
    { name: 'PARQUE PRIVADO', icon: Users, path: '/parque', category: 'OPERATIONS' },
    { name: 'RECURSOS HUMANOS', icon: Users, path: '/rh', category: 'MANAGEMENT' },
    { name: 'CONTROLO ACESSOS', icon: ShieldCheck, path: '/rh/usuarios', category: 'MANAGEMENT', adminOnly: true },
    { name: 'CENTRAL DE AJUDA', icon: BookOpen, path: '/ajuda', category: 'CORE' },
];

interface MobileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout, checkAccess } = useAuth();

    const handleLogout = () => {
        logout();
        router.push('/login');
        onClose();
    };

    if (!user) return null;

    const visibleMenuItems = menuItems.filter(item => {
        if ((item as any).adminOnly && user.role !== 'ADMINISTRATOR') return false;
        return true;
    });

    const categories = ['CORE', 'HOSPITALITY', 'WELLNESS', 'OPERATIONS', 'MANAGEMENT'];
    const catLabels: Record<string, string> = {
        CORE: 'Sistema',
        HOSPITALITY: 'Hospitalidade',
        WELLNESS: 'Bem-estar',
        OPERATIONS: 'Operações',
        MANAGEMENT: 'Gestão',
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm"
                    />

                    {/* Drawer Panel */}
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed top-0 left-0 bottom-0 z-[200] w-[85vw] max-w-[320px] glass-panel border-r border-white/10 flex flex-col shadow-[20px_0_60px_rgba(0,0,0,0.8)] overflow-hidden"
                    >
                        {/* Top gradient line */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-accent)] to-transparent" />

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-10 bg-[var(--brand-primary)] rounded-full shadow-[0_0_15px_var(--brand-primary)] animate-pulse" />
                                <div>
                                    <h2 className="text-lg font-black text-white tracking-widest" style={{ color: 'var(--brand-primary)' }}>HR-HOSP</h2>
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em]">Luxury Suite</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Nav */}
                        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6 no-scrollbar">
                            {categories.map(cat => {
                                const catItems = visibleMenuItems.filter(i => i.category === cat);
                                if (!catItems.length) return null;
                                return (
                                    <div key={cat} className="space-y-1">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em] px-3 mb-2">{catLabels[cat]}</p>
                                        {catItems.map(item => {
                                            const isActive = pathname === item.path;
                                            const hasAccess = checkAccess(item.path);

                                            if (!hasAccess) {
                                                return (
                                                    <div key={item.path}
                                                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-red-500/15 bg-red-500/5 opacity-40 cursor-not-allowed"
                                                    >
                                                        <Lock className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                        <span className="text-xs font-black tracking-wider text-red-400 line-through truncate">{item.name}</span>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <Link key={item.path} href={item.path} onClick={onClose}>
                                                    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                                                        isActive
                                                            ? 'bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/30 shadow-[0_0_15px_rgba(0,71,171,0.15)]'
                                                            : 'hover:bg-white/5 border border-transparent'
                                                    }`}>
                                                        <item.icon
                                                            className="w-5 h-5 flex-shrink-0"
                                                            style={{ color: isActive ? 'var(--brand-primary)' : 'rgba(255,255,255,0.5)' }}
                                                        />
                                                        <span className={`text-xs font-black tracking-wider truncate ${
                                                            isActive ? 'text-white' : 'text-white/50'
                                                        }`}>{item.name}</span>
                                                        {isActive && (
                                                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] shadow-[0_0_8px_var(--brand-primary)]" />
                                                        )}
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </nav>

                        {/* User footer */}
                        <div className="px-4 pb-6 pt-4 border-t border-white/5 space-y-3">
                            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="w-9 h-9 rounded-full bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/30 flex items-center justify-center flex-shrink-0">
                                    <UserCheck className="w-5 h-5 text-[var(--brand-primary)]" />
                                </div>
                                <div className="overflow-hidden flex-1">
                                    <p className="text-xs font-black text-white uppercase tracking-wide truncate">{user.name}</p>
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest truncate">{user.role}</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 hover:bg-red-500/15 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-lg transition-all text-white/30 flex-shrink-0"
                                    title="Sair"
                                    aria-label="Terminar sessão"
                                >
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
