'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3,
    Home,
    Store,
    Users,
    LucideIcon
} from 'lucide-react';

interface BottomNavItem {
    name: string;
    icon: LucideIcon;
    path: string;
}

const items: BottomNavItem[] = [
    { name: 'DASHBOARD', icon: BarChart3, path: '/' },
    { name: 'ALOJAMANTO', icon: Home, path: '/alojamento' },
    { name: 'POS', icon: Store, path: '/pos' },
    { name: 'RH', icon: Users, path: '/rh' },
];

export function BottomBar() {
    const pathname = usePathname();

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[92%] max-w-[500px]">
            <div className="glass-panel p-3 rounded-full border-white/10 flex justify-around items-center shadow-[0_30px_60px_rgba(0,0,0,0.8)]">
                {items.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                        <Link key={item.path} href={item.path}>
                            <motion.div
                                whileTap={{ scale: 0.9 }}
                                className={`relative p-4 rounded-full transition-all duration-300 ${isActive ? 'bg-[#00FFFF]/10 border border-[#00FFFF]/20' : ''
                                    }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activeBottom"
                                        className="absolute inset-0 bg-[#00FFFF]/10 rounded-full shadow-[0_0_20px_rgba(0,255,255,0.2)]"
                                    />
                                )}
                                <item.icon className={`w-6 h-6 transition-all ${isActive ? 'text-[#00FFFF] animate-pulse-cyan' : 'text-white/30'
                                    }`} />
                            </motion.div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
