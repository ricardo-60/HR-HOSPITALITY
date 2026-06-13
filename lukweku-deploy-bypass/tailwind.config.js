/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./*.js"
    ],
    theme: {
        extend: {
            colors: {
                'lk-blue': '#003366',
                'lk-azure': '#007BFF',
                'lk-gold': '#D4AF37',
                'lk-dark': '#001a33',
            }
        },
    },
    plugins: [],
}
