/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#25D366',
          'green-dark': '#128C7E',
          teal: '#075E54',
          panel: '#f0f2f5',
          'panel-dark': '#202c33',
          chat: '#efeae2',
          'chat-dark': '#0b141a',
          bubble: {
            sent: '#d9fdd3',
            'sent-dark': '#005c4b',
            received: '#ffffff',
            'received-dark': '#202c33',
          },
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
