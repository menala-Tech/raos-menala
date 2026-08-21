import nextConfig from 'eslint-config-next'

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'android/**'],
  },
  {
    rules: {
      // Rule Next.js 16 baru ini menandai SEMUA setState di dalam useEffect
      // sebagai error — termasuk pola fetch-data yang sah (fetch async lalu
      // setData(result)). Karena pola ini di RAOS ada di banyak halaman
      // (chat, settings, drivers, riwayat, dst), matikan di project-level.
      // Bukan bug — hanya micro-optimization advisory.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default eslintConfig
