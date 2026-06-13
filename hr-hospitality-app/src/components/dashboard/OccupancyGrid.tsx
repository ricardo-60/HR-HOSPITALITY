import { Room } from '@/types';

const mockRooms: Room[] = [
    { id: '1', number: '101', type: 'SINGLE', status: 'AVAILABLE', pricePerNight: 50 },
    { id: '2', number: '102', type: 'DOUBLE', status: 'OCCUPIED', pricePerNight: 80 },
    { id: '3', number: '103', type: 'SUITE', status: 'CLEANING', pricePerNight: 150 },
    { id: '4', number: '104', type: 'SINGLE', status: 'MAINTENANCE', pricePerNight: 50 },
    { id: '5', number: '201', type: 'DELUXE', status: 'AVAILABLE', pricePerNight: 120 },
    { id: '6', number: '202', type: 'DOUBLE', status: 'OCCUPIED', pricePerNight: 80 },
];

export function OccupancyGrid() {
    const getStatusColor = (status: Room['status']) => {
        switch (status) {
            case 'AVAILABLE': return 'bg-green-100 border-green-200 text-green-700 hover:bg-green-200';
            case 'OCCUPIED': return 'bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200';
            case 'CLEANING': return 'bg-yellow-100 border-yellow-200 text-yellow-700 hover:bg-yellow-200';
            case 'MAINTENANCE': return 'bg-red-100 border-red-200 text-red-700 hover:bg-red-200';
            default: return 'bg-slate-100 border-slate-200 text-slate-700';
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Mapa de Ocupação</h2>
                <div className="flex gap-4 text-xs font-semibold">
                    <span className="flex items-center"><div className="w-3 h-3 bg-green-500 rounded-full mr-1" /> Livre</span>
                    <span className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-full mr-1" /> Ocupado</span>
                    <span className="flex items-center"><div className="w-3 h-3 bg-yellow-500 rounded-full mr-1" /> Limpeza</span>
                    <span className="flex items-center"><div className="w-3 h-3 bg-red-500 rounded-full mr-1" /> Manutenção</span>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {mockRooms.map((room) => (
                    <div
                        key={room.id}
                        className={`cursor-pointer transition-all duration-200 border-2 p-4 rounded-lg flex flex-col items-center justify-center space-y-1 ${getStatusColor(room.status)}`}
                    >
                        <span className="text-lg font-bold">{room.number}</span>
                        <span className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">{room.type}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
