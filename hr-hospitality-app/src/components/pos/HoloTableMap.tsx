'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useState, useRef } from 'react';

interface Table {
  id: number;
  number: number;
  status: 'FREE' | 'OCCUPIED' | 'RESERVED';
  orders: number;
  total: number;
}

const tables: Table[] = [
  { id: 1, number: 1, status: 'OCCUPIED', orders: 3, total: 45.50 },
  { id: 2, number: 2, status: 'FREE', orders: 0, total: 0 },
  { id: 3, number: 3, status: 'RESERVED', orders: 0, total: 0 },
  { id: 4, number: 4, status: 'OCCUPIED', orders: 1, total: 12.00 },
  { id: 5, number: 5, status: 'FREE', orders: 0, total: 0 },
  { id: 6, number: 6, status: 'OCCUPIED', orders: 5, total: 89.90 },
];

export function HoloTableMap() {
  const { user } = useAuth();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const startDragging = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setStartX(clientX - (viewportRef.current?.offsetLeft || 0));
    setScrollLeft(viewportRef.current?.scrollLeft || 0);
  };

  const stopDragging = () => setIsDragging(false);

  const onDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - (viewportRef.current?.offsetLeft || 0);
    const walk = (x - startX) * 2;
    if (viewportRef.current) viewportRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div
      ref={viewportRef}
      onMouseDown={startDragging}
      onMouseLeave={stopDragging}
      onMouseUp={stopDragging}
      onMouseMove={onDrag}
      onTouchStart={startDragging}
      onTouchEnd={stopDragging}
      onTouchMove={onDrag}
      className="map-viewport w-full"
    >
      <div className="flex px-10 py-16 gap-12 sm:gap-20 md:gap-24 min-w-max">
        {tables.map((table) => (
          <motion.div
            key={table.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative group select-none"
          >
            {/* Table Base - Adjustable Size */}
            <div className={`w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-full glass-panel flex flex-col items-center justify-center transition-all duration-500 shadow-2xl relative overflow-hidden ${table.status === 'OCCUPIED'
                ? 'border-[#00FFFF] shadow-[0_0_40px_rgba(0,255,255,0.2)]'
                : table.status === 'RESERVED'
                  ? 'border-cyber-purple/40 shadow-[0_0_30px_rgba(167,139,250,0.1)]'
                  : 'border-white/10'
              }`}>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-50" />

              <span className="text-6xl sm:text-7xl md:text-8xl font-black text-white tracking-tighter z-10">
                {table.number}
              </span>
              <span className={`text-[10px] sm:text-[12px] font-black uppercase tracking-widest z-10 mt-2 sm:mt-4 ${table.status === 'OCCUPIED' ? 'text-[#00FFFF] animate-pulse-cyan' : 'text-white/20'
                }`}>
                {table.status}
              </span>

              {table.status === 'OCCUPIED' && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#00FFFF]/20 animate-scan-fast" />
                </div>
              )}
            </div>

            {/* Price Badge - Larger Touch Area */}
            {table.status === 'OCCUPIED' && (
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="absolute -top-4 -right-4 bg-[#00FFFF] text-black px-6 py-4 sm:px-10 sm:py-5 rounded-2xl md:rounded-3xl font-black text-xs sm:text-lg shadow-[0_20px_40px_rgba(0,255,255,0.4)] flex items-center gap-3 z-30"
              >
                <span className="font-mono tracking-tighter">{table.total.toFixed(2)}Kz</span>
              </motion.div>
            )}

            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Attributed to: {user?.name.split(' ')[0]}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
