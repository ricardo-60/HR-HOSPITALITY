export interface TenantConfig {
    id: string;
    name: string;
    slug: string;
    currency: string;
    colors: {
        primary: string;    // Azul Oceano
        secondary: string;  // Amarelo Solar
        accent: string;     // Turquesa
        background: string;
    };
    slogan: string;
    logoUrl?: string;
}

export const tenants: Record<string, TenantConfig> = {
    'lukweku': {
        id: 'luk-001',
        name: 'Hotel Lukweku',
        slug: 'hotel-lukweku',
        currency: 'Kz',
        colors: {
            primary: '#0047AB',    // Azul Oceano
            secondary: '#FFD700',  // Amarelo Solar
            accent: '#40E0D0',    // Turquesa
            background: '#111827' // Mantem Cinza-Ardosia Profundo
        },
        slogan: 'Da nossa terra para o seu coração!',
    }
};

export const DEFAULT_TENANT = tenants['lukweku'];
