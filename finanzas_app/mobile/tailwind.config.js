/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de la app — mismos valores que el web
        accent:  '#c8f060',
        dark:    '#0f0f0f',
        muted:   '#888884',
        border:  '#e8e8e4',
        surface: '#f7f7f5',
        danger:  '#ff4d4d',
        success: '#22a06b',
      },
    },
  },
  plugins: [],
}
