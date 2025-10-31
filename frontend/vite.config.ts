import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: [
      '.dns-zs.partner.ru',
      '.dns-zs.ru'
    ],
  },
  preview: {
    port: 4174,
    allowedHosts: [
      '.dns-zs.partner.ru',
      '.dns-zs.ru'
    ],
  },
  resolve: {
    alias: {
      '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  }
})
