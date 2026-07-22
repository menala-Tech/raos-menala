import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#F5A623',    // Kuning Menala
        secondary: '#1A1A2E',  // Navy dark
        accent: '#22C55E',     // Hijau sukses
        danger: '#EF4444',     // Merah
        surface: '#F8F9FA',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
