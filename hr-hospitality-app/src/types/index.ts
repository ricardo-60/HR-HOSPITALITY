export interface Guest {
    id: string;
    fullName: string;
    documentId: string;
    email: string;
    status: 'ACTIVE' | 'CHECKED_OUT';
    roomId?: string;
}

export interface Room {
    id: string;
    number: string;
    type: 'SINGLE' | 'DOUBLE' | 'SUITE' | 'DELUXE';
    status: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';
    pricePerNight: number;
}

export interface Product {
    id: string;
    name: string;
    sku: string;
    stockCurrent: number;
    stockMin: number;
    price: number;
    ingredients?: string[];
}

export interface Transaction {
    id: string;
    guestId?: string;
    amount: number;
    status: 'PAID' | 'PENDING_ROOM' | 'CANCELLED';
    location: 'POS_RESTAURANT' | 'GYM' | 'PARKING';
    createdAt: Date;
}

export interface Table {
    id: string;
    number: number;
    status: 'FREE' | 'OCCUPIED' | 'RESERVED';
    currentBill?: number;
}
