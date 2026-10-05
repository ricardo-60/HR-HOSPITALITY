'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

interface SubMenuItemProps {
    subItem: {
        name: string;
        path: string;
        icon: React.ReactNode;
        description?: string;
    };
    item: {
        name: string;
        brandColor?: string;
    };
    isCompact: boolean;
    pathname: string;
    checkAccess: (path: string) => boolean;
}

export function SubMenuItem({ subItem, item, isCompact, pathname, checkAccess }: SubMenuItemProps) {
    const subIsActive = pathname === subItem.path;
    const subHasAccess = checkAccess(subItem.path);

    function renderAccessible() {
        return (
            <div key={subItem.path} className='relative'>
                <Link href={subItem.path} className='block'>
                    <motion.div
                        whileHover={{ x: isCompact ? 0 : 4, scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className='flex items-center rounded-xl md:rounded-2xl transition-all duration-300 ' + (isCompact ? 'justify-center p-2 md:p-3' : 'gap-3 md:gap-4 px-4 md:px-5 py-2 md:py-3') + ' ' + (subIsActive ? 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 shadow-[0_0_15px_rgba(0,71,171,0.15)]' : 'hover:bg-[var(--brand-primary)]/5 border border-transparent hover:border-[var(--brand-primary)]/20')
                    >
                        {subIsActive && !isCompact && (
                            <motion.div
                                layoutId='active-sub'
                                className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 md:h-8 bg-[var(--brand-primary)] rounded-r-full shadow-[0_0_10px_var(--brand-primary)]'
                            />
                        )}
                        <subItem.icon
                            className='w-4 h-4 md:w-5 md:h-5 transition-all z-10 ' + (subIsActive ? 'animate-pulse' : 'opacity-70 group-hover:opacity-100 group-hover:scale-110')
                            style={{ color: subIsActive ? 'var(--brand-primary)' : (item.brandColor || 'white/70') }}
                        />
                        {!isCompact && (
                            <div className='flex flex-col gap-0.5 z-10 w-full'>
                                <span className='text-[10px] md:text-xs font-medium tracking-wider transition-all ' + (subIsActive ? 'text-white drop-shadow-[0_0_6px_var(--brand-primary)]' : 'text-white/60 group-hover:text-white')>
                                    {subItem.name}
                                </span>
                                {subItem.description && (
                                    <span className='text-[8px] md:text-[9px] font-medium text-white/30 uppercase tracking-wider truncate'>
                                        {subItem.description}
                                    </span>
                                )}
                            </div>
                        )}
                        {isCompact && (
                            <div className='sidebar-tooltip hidden md:block text-xs'>
                                {subItem.name}
                            </div>
                        )}
                    </motion.div>
                </Link>
            </div>
        );
    }

    function renderLocked() {
        return (
            <div key={subItem.path} className='relative'>
                <div className='flex items-center rounded-xl md:rounded-2xl border border-dashed border-red-500/10 bg-red-500/5 opacity-40 cursor-not-allowed ' + (isCompact ? 'justify-center p-2 md:p-3' : 'gap-3 md:gap-4 px-4 md:px-5 py-2 md:py-3')>
                    <Lock className='w-4 h-4 md:w-5 md:h-5 text-red-500' />
                    {!isCompact && (
                        <div className='flex items-center gap-2 md:gap-3 w-full'>
                            <span className='text-[10px] md:text-xs font-medium tracking-wider text-red-400 line-through'>
                                {subItem.name}
                            </span>
                            <span className='ml-auto px-1.5 py-0.5 md:px-2 md:py-1 rounded-md bg-red-500/10 border border-red-500/20 text-[7px] md:text-[8px] text-red-400 font-black uppercase tracking-widest leading-none'>
                                Bloqueado
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (subHasAccess) {
        return renderAccessible();
    }
    return renderLocked();
}
