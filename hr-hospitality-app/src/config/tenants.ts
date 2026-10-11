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
    /** NIF e morada oficiais - obrigatorios em faturas e extratos de conta. */
    nif?: string;
    address?: string;
    city?: string;
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
        nif: '5484045614',
        address: 'Avenida 21 de Janeiro, Benfica',
        city: 'Luanda',
    }
};

export const DEFAULT_TENANT = tenants['lukweku'];
