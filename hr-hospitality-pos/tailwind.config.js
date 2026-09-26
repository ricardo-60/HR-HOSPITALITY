/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mesma identidade institucional do resto do ecossistema.
        ocean: { DEFAULT: '#0A2342', dark: '#040F1D', light: '#123A63' },
        gold: { DEFAULT: '#FBBF24', light: '#FCD34D', dark: '#D97706' },
        aqua: { DEFAULT: '#00F2FF', dark: '#00B8C4' },
        ink: { DEFAULT: '#0B1220', soft: '#1A2436', line: '#24324A' },
        // Estados de mesa, pensados para serem lidos à distância num tablet.
        tableFree: '#10B981',
        tableBusy: '#F59E0B',
        tableReserved: '#8B5CF6',
        tableDown: '#6B7280',
      },
    },
  },
  plugins: [],
};
