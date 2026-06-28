'use client';

import { usePathname, useRouter } from 'next/navigation';
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
    Lock,
    LogOut,
    UserCheck,
    LucideIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';

interface MenuItem {
    name: string;
    icon: LucideIcon;
    path: string;
    category: 'CORE' | 'HOSPITALITY' | 'WELLNESS' | 'OPERATIONS' | 'MANAGEMENT';
    isReady?: boolean;
    brandColor?: string;
    adminOnly?: boolean;
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
    { name: 'RECURSOS HUMANOS', icon: Users, path: '/rh', category: 'MANAGEMENT', isReady: true, brandColor: 'var(--brand-primary)' },
    { name: 'CONTROLO ACESSOS', icon: ShieldCheck, path: '/rh/usuarios', category: 'MANAGEMENT', isReady: true, brandColor: 'var(--brand-accent)', adminOnly: true },
    { name: 'CONFIGURAÇÕES', icon: Settings, path: '/configuracoes', category: 'CORE' },
];

interface SidebarProps {
    isCompact?: boolean;
}

export function Sidebar({ isCompact = false }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout, checkAccess } = useAuth();

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    if (!user) return null;

    // Filter items to hide AdminOnly menus for non-admins
    const visibleMenuItems = menuItems.filter(item => {
        if (item.adminOnly && user.role !== 'ADMINISTRATOR') {
            return false;
        }
        return true;
    });

    return (
        <div className={`h-full glass-panel flex flex-col py-8 md:py-10 border-r border-white/5 shadow-2xl overflow-y-auto no-scrollbar transition-all duration-500 ${
            isCompact ? 'w-24 px-3 md:px-4' : 'w-72 md:w-80 px-6 md:px-8'
        }`}>
            {/* Brand Header */}
            <div className={`mb-12 md:mb-16 flex items-center ${isCompact ? 'justify-center' : 'px-2 md:px-4 gap-4'}`}>
                <div className={`bg-[var(--brand-primary)] shadow-[0_0_20px_var(--brand-primary)] rounded-full animate-pulse transition-all ${
                    isCompact ? 'w-2 h-10 md:h-12' : 'w-2 h-10 md:h-12'
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

            {/* Navigation links */}
            <nav className="flex-1 space-y-10 md:space-y-12">
                {['CORE', 'HOSPITALITY', 'WELLNESS', 'OPERATIONS', 'MANAGEMENT'].map((cat) => {
                    const categoryItems = visibleMenuItems.filter((item) => item.category === cat);
                    if (categoryItems.length === 0) return null;

                    return (
                        <div key={cat} className="space-y-3 md:space-y-4">
                            {!isCompact && <h3 className="px-4 text-[10px] md:text-xs font-black text-white/20 uppercase tracking-[0.5em] ml-2">{cat}</h3>}
                            <div className="space-y-1 md:space-y-2">
                                {categoryItems.map((item) => {
                                    const isActive = pathname === item.path;
                                    const hasAccess = checkAccess(item.path);

                                    return (
                                        <div key={item.path} className="relative group">
                                            {hasAccess ? (
                                                <Link href={item.path} className="block">
                                                    <motion.div
                                                        whileHover={{ x: isCompact ? 0 : 8, scale: 1.02 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        className={`flex items-center rounded-xl md:rounded-2xl transition-all duration-300 ${
                                                            isCompact ? 'justify-center p-3 md:p-4' : 'gap-4 md:gap-5 px-5 md:px-6 py-3 md:py-4'
                                                        } ${
                                                            isActive
                                                                ? 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 shadow-[0_0_20px_rgba(0,71,171,0.2)]'
                                                                : 'hover:bg-[var(--brand-primary)]/5 border border-transparent hover:border-[var(--brand-primary)]/25'
                                                        }`}
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
                                                                <span className={`text-xs md:text-sm font-black tracking-widest transition-all ${
                                                                    isActive ? 'text-white drop-shadow-[0_0_8px_var(--brand-primary)]' : 'text-white/50 group-hover:text-white'
                                                                }`}>
                                                                    {item.name}
                                                                </span>
                                                                {item.isReady && (
                                                                    <span className="ml-auto px-2 py-1 md:px-3 md:py-1.5 rounded-md bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/30 text-[9px] md:text-[10px] text-[var(--brand-accent)] font-black uppercase tracking-widest leading-none">
                                                                        OK
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                </Link>
                                            ) : (
                                                /* Locked/Restricted Menu Item styling */
                                                <div className={`flex items-center rounded-xl md:rounded-2xl border border-dashed border-red-500/10 bg-red-500/5 opacity-40 cursor-not-allowed ${
                                                    isCompact ? 'justify-center p-3 md:p-4' : 'gap-4 md:gap-5 px-5 md:px-6 py-3 md:py-4'
                                                }`}>
                                                    <Lock className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
                                                    {!isCompact && (
                                                        <div className="flex items-center gap-2 md:gap-3 w-full">
                                                            <span className="text-xs md:text-sm font-black tracking-widest text-red-400 line-through">
                                                                {item.name}
                                                            </span>
                                                            <span className="ml-auto px-2 py-1 md:px-3 md:py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-[8px] md:text-[9px] text-red-400 font-black uppercase tracking-widest leading-none">
                                                                Bloqueado
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Compact Tooltip */}
                                            {isCompact && (
                                                <div className="sidebar-tooltip hidden md:block text-xs">
                                                    {item.name} {!hasAccess && ' (Bloqueado)'}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {/* Operator Status & Logout Button */}
            <div className={`mt-12 md:mt-20 pt-8 md:pt-10 border-t border-white/5 ${isCompact ? 'flex flex-col items-center gap-4' : 'px-4 md:px-6'}`}>
                <div className={`bg-white/5 rounded-xl md:rounded-2xl border border-white/5 flex items-center justify-between ${
                    isCompact ? 'p-2 md:p-3' : 'p-3 md:p-4 gap-3 md:gap-4'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 flex items-center justify-center">
                            <UserCheck className="w-5 h-5 md:w-6 md:h-6 text-[var(--brand-primary)]" />
                        </div>
                        {!isCompact && (
                            <div className="overflow-hidden max-w-[120px]">
                                <p className="text-xs md:text-sm font-black text-white uppercase tracking-widest truncate">{user.name}</p>
                                <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-widest mt-1 truncate">{user.role}</p>
                            </div>
                        )}
                    </div>

                    {!isCompact && (
                        <button
                            onClick={handleLogout}
                            className="p-2 hover:bg-red-500/10 hover:text-red-500 border border-transparent hover:border-red-500/20 rounded-xl transition-all text-white/40"
                            title="Sair do Sistema"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {isCompact && (
                    <button
                        onClick={handleLogout}
                        className="p-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        title="Sair do Sistema"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
