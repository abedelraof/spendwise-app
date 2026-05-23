/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        slate: {
          850: '#172033',
          950: '#0b1120',
        },
      },
      boxShadow: {
        card:   '0 1px 3px 0 rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .04)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / .08), 0 2px 4px -1px rgb(0 0 0 / .04)',
        glow:   '0 0 20px -4px rgb(124 58 237 / .4)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)',
        'card-gradient':  'linear-gradient(135deg, #1e1b4b 0%, #1e1248 100%)',
      },
      animation: {
        'fade-in':        'fadeIn .2s ease-out',
        'slide-up':       'slideUp .25s ease-out',
        'scale-in':       'scaleIn .15s ease-out',
        'slide-up-full':  'slideUpFull .3s ease-out',
      },
      keyframes: {
        fadeIn:      { from: { opacity: 0 },                               to: { opacity: 1 } },
        slideUp:     { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn:     { from: { opacity: 0, transform: 'scale(.95)' },      to: { opacity: 1, transform: 'scale(1)' } },
        slideUpFull: { from: { transform: 'translateY(100%)' },            to: { transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
