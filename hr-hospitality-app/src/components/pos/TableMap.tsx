'use client';

import { Table } from '@/types';
import { useState } from 'react';
import { BillModal } from './BillModal';

const mockTables: Table[] = [
    { id: '1', number: 1, status: 'FREE' },
    { id: '2', number: 2, status: 'OCCUPIED', currentBill: 45.50 },
    { id: '3', number: 3, status: 'FREE' },
    { id: '4', number: 4, status: 'OCCUPIED', currentBill: 120.00 },
    { id: '5', number: 5, status: 'RESERVED' },
    { id: '6', number: 6, status: 'FREE' },
];

export function TableMap() {
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);

    return (
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Mapa de Mesas - Restaurante</h2>
                    <p className="text-slate-500 text-sm">Gestão em tempo real de ocupação e pedidos.</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {mockTables.map((table) => (
                    <div
                        key={table.id}
                        onClick={() => table.status === 'OCCUPIED' && setSelectedTable(table)}
                        className={`relative h-32 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 cursor-pointer border-2
              ${table.status === 'FREE' ? 'bg-slate-50 border-slate-200 hover:border-blue-400' : ''}
              ${table.status === 'OCCUPIED' ? 'bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-200 transform scale-105' : ''}
              ${table.status === 'RESERVED' ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}
            `}
                    >
                        <span className="text-3xl font-black mb-1">{table.number}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                            {table.status === 'FREE' ? 'Livre' : table.status === 'OCCUPIED' ? 'Em Consumo' : 'Reservada'}
                        </span>

                        {table.currentBill && (
                            <div className="absolute -top-3 -right-3 bg-white text-blue-600 px-3 py-1 rounded-full text-xs font-black shadow-md border border-blue-100">
                                {table.currentBill.toFixed(2)}Kz
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {selectedTable && (
                <BillModal
                    table={selectedTable}
                    onClose={() => setSelectedTable(null)}
                />
            )}
        </div>
    );
}
