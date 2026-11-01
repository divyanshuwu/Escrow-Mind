/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paypal: {
          blue: '#003087',
          dark: '#001c64',
          light: '#0079C1',
          gold: '#FFC439',
        },
      },
    },
  },
  plugins: [],
};
