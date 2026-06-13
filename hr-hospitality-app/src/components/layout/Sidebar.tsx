'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    BarChart3,
    Home,
    Store,
    Settings,
    Package,
    ShieldCheck,
    Users,
    Building2,
    Heart,
    LucideIcon
} from 'lucide-react';
import { motion } from 'framer-motion';

interface MenuItem {
    name: string;
    icon: LucideIcon;
    path: string;
    category: 'CORE' | 'HOSPITALITY' | 'WELLNESS' | 'OPERATIONS' | 'MANAGEMENT';
    isReady?: boolean;
    brandColor?: string;
}

const menuItems: MenuItem[] = [
    { name: 'DASHBOARD', icon: BarChart3, path: '/', category: 'CORE' },
    { name: 'ALOJAMENTO', icon: Home, path: '/alojamento', category: 'HOSPITALITY', isReady: true, brandColor: 'var(--brand-primary)' },
    { name: 'RESTAURAÇÃO', icon: Store, path: '/pos', category: 'HOSPITALITY', isReady: true, brandColor: 'var(--brand-secondary)' },
    { name: 'EVENTOS', icon: Building2, path: '/eventos', category: 'HOSPITALITY', isReady: true, brandColor: 'var(--brand-accent)' },
    { name: 'BEM-ESTAR E LAZER', icon: Heart, path: '/spa', category: 'WELLNESS', isReady: true, brandColor: 'var(--brand-accent)' },
    { name: 'LAVANDARIA', icon: Package, path: '/lavandaria', category: 'OPERATIONS', isReady: true, brandColor: 'var(--brand-primary)' },
    { name: 'TRANSFER', icon: ShieldCheck, path: '/transfer', category: 'OPERATIONS', isReady: true, brandColor: 'var(--brand-secondary)' },
    { name: 'PARQUE PRIVADO', icon: Users, path: '/parque', category: 'OPERATIONS', isReady: true, brandColor: 'var(--brand-accent)' },
    { name: 'CONFIGURAÇÕES', icon: Settings, path: '/configuracoes', category: 'CORE' },
];

interface SidebarProps {
    isCompact?: boolean;
}

export function Sidebar({ isCompact = false }: SidebarProps) {
    const pathname = usePathname();

    return (
        <div className={`h-full glass-panel flex flex-col py-8 md:py-10 border-r border-white/5 shadow-2xl overflow-y-auto no-scrollbar transition-all duration-500 ${isCompact ? 'w-24 px-3 md:px-4' : 'w-72 md:w-80 px-6 md:px-8'
            }`}>
            {/* Brand Header */}
            <div className={`mb-12 md:mb-16 flex items-center ${isCompact ? 'justify-center' : 'px-2 md:px-4 gap-4'}`}>
                <div className={`bg-[var(--brand-primary)] shadow-[0_0_20px_var(--brand-primary)] rounded-full animate-pulse transition-all ${isCompact ? 'w-2 h-10 md:h-12' : 'w-2 h-10 md:h-12'
                    }`} />
                {!isCompact && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <h1 className="text-xl md:text-2xl font-black text-white tracking-widest drop-shadow-[0_0_8px_var(--brand-primary)]" style={{ color: 'var(--brand-primary)' }}>
                            HR-HOSP
                        </h1>
                        <p className="text-[10px] md:text-xs font-black text-white/40 uppercase tracking-[0.4em] ml-1 mt-1">Luxury Suite</p>
                    </motion.div>
                )}
            </div>

            <nav className="flex-1 space-y-10 md:space-y-12">
                {['CORE', 'HOSPITALITY', 'WELLNESS', 'OPERATIONS', 'MANAGEMENT'].map((cat) => (
                    <div key={cat} className="space-y-3 md:space-y-4">
                        {!isCompact && <h3 className="px-4 text-[10px] md:text-xs font-black text-white/20 uppercase tracking-[0.5em] ml-2">{cat}</h3>}
                        <div className="space-y-1 md:space-y-2">
                            {menuItems
                                .filter((item) => item.category === cat)
                                .map((item) => {
                                    const isActive = pathname === item.path;
                                    return (
                                        <Link key={item.path} href={item.path} className="block group relative">
                                            <motion.div
                                                whileHover={{ x: isCompact ? 0 : 8, scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                className={`flex items-center rounded-xl md:rounded-2xl transition-all duration-300 ${isCompact ? 'justify-center p-3 md:p-4' : 'gap-4 md:gap-5 px-5 md:px-6 py-3 md:py-4'
                                                    } ${isActive ? 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 shadow-[0_0_20px_rgba(0,71,171,0.2)]' : 'hover:bg-[var(--brand-primary)]/5 border border-transparent hover:border-[var(--brand-primary)]/20'}`}
                                            >
                                                {isActive && !isCompact && (
                                                    <motion.div
                                                        layoutId="activeBar"
                                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 md:h-10 bg-[var(--brand-primary)] rounded-r-full shadow-[0_0_15px_var(--brand-primary)]"
                                                    />
                                                )}
                                                <item.icon 
                                                    className={`w-5 h-5 md:w-6 md:h-6 transition-all z-10 ${isActive ? 'animate-pulse' : 'opacity-80 group-hover:opacity-100 group-hover:scale-110'}`} 
                                                    style={{ color: isActive ? 'var(--brand-primary)' : (item.brandColor || 'white') }} 
                                                />
                                                {!isCompact && (
                                                    <div className="flex items-center gap-2 md:gap-3 z-10 w-full">
                                                        <span className={`text-xs md:text-sm font-black tracking-widest transition-all ${isActive ? 'text-white drop-shadow-[0_0_8px_var(--brand-primary)]' : 'text-white/50 group-hover:text-white'
                                                            }`}>
                                                            {item.name}
                                                        </span>
                                                        {item.isReady && (
                                                            <span className="ml-auto px-2 py-1 md:px-3 md:py-1.5 rounded-md bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30 text-[9px] md:text-[10px] text-[var(--brand-accent)] font-black uppercase tracking-widest leading-none">
                                                                Disponível
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Compact Tooltip */}
                                                {isCompact && (
                                                    <div className="sidebar-tooltip hidden md:block text-xs">
                                                        {item.name}
                                                    </div>
                                                )}
                                            </motion.div>
                                        </Link>
                                    );
                                })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Operator Status */}
            <div className={`mt-12 md:mt-20 pt-8 md:pt-10 border-t border-white/5 ${isCompact ? 'flex justify-center' : 'px-4 md:px-6'}`}>
                <div className={`bg-white/5 rounded-xl md:rounded-2xl border border-white/5 flex items-center ${isCompact ? 'p-2 md:p-3' : 'p-3 md:p-4 gap-3 md:gap-4'}`}>
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 md:w-6 md:h-6 text-[var(--brand-primary)]" />
                    </div>
                    {!isCompact && (
                        <div className="overflow-hidden">
                            <p className="text-xs md:text-sm font-black text-white uppercase tracking-widest truncate">R. FERREIRA</p>
                            <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Admin Level 5</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper icon component
function UserCircle({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="10" r="3" />
            <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
        </svg>
    );
}
