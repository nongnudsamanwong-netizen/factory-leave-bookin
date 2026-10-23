/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Sarabun', 'Noto Sans Thai', 'system-ui', 'sans-serif'] },
      colors: {
        shiftA: { light: '#dbeafe', DEFAULT: '#2563eb', dark: '#1e40af' },
        shiftB: { light: '#ffedd5', DEFAULT: '#ea580c', dark: '#9a3412' },
      },
    },
  },
  plugins: [],
};
