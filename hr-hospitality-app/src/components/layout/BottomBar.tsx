'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3, Home, Store, Users, Lock, Menu, LucideIcon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface BottomNavItem {
    name: string;
    icon: LucideIcon;
    path: string;
}

const items: BottomNavItem[] = [
    { name: 'DASHBOARD', icon: BarChart3, path: '/' },
    { name: 'ALOJAMENTO', icon: Home, path: '/alojamento' },
    { name: 'POS', icon: Store, path: '/pos' },
    { name: 'RH', icon: Users, path: '/rh' },
];

interface BottomBarProps {
    onMenuOpen?: () => void;
}

export function BottomBar({ onMenuOpen }: BottomBarProps) {
    const pathname = usePathname();
    const { checkAccess, user } = useAuth();

    if (!user) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[200] pb-safe">
            <div className="mx-3 mb-3">
                <div className="glass-panel border border-white/10 rounded-2xl flex items-center shadow-[0_-10px_40px_rgba(0,0,0,0.6)] overflow-hidden">
                    {/* Menu Hamburguer */}
                    <button
                        onClick={onMenuOpen}
                        className="flex flex-col items-center justify-center gap-1 flex-1 py-3.5 hover:bg-white/5 transition-all active:scale-95"
                        aria-label="Menu completo"
                    >
                        <Menu className="w-5 h-5 text-white/40" />
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-wider">MENU</span>
                    </button>

                    {/* Divider */}
                    <div className="w-px h-10 bg-white/5" />

                    {/* Nav items */}
                    {items.map((item) => {
                        const isActive = pathname === item.path;
                        const hasAccess = checkAccess(item.path);

                        if (!hasAccess) {
                            return (
                                <div
                                    key={item.path}
                                    className="flex flex-col items-center justify-center gap-1 flex-1 py-3.5 opacity-30 cursor-not-allowed"
                                >
                                    <Lock className="w-5 h-5 text-red-500" />
                                    <span className="text-[8px] font-black text-red-400 uppercase tracking-wider">{item.name}</span>
                                </div>
                            );
                        }

                        return (
                            <Link key={item.path} href={item.path} className="flex-1">
                                <motion.div
                                    whileTap={{ scale: 0.9 }}
                                    className={`relative flex flex-col items-center justify-center gap-1 py-3.5 transition-all ${
                                        isActive ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-white/5'
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeBottom"
                                            className="absolute top-0 left-2 right-2 h-0.5 bg-[var(--brand-accent)] rounded-full shadow-[0_0_8px_var(--brand-accent)]"
                                        />
                                    )}
                                    <item.icon className={`w-5 h-5 transition-all ${
                                        isActive ? 'text-[var(--brand-accent)]' : 'text-white/30'
                                    }`} />
                                    <span className={`text-[8px] font-black uppercase tracking-wider transition-all ${
                                        isActive ? 'text-[var(--brand-accent)]' : 'text-white/20'
                                    }`}>{item.name}</span>
                                </motion.div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
