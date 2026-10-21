import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        cv: resolve(import.meta.dirname, 'cv/index.html'),
        businessCard: resolve(import.meta.dirname, 'business-card/index.html'),
        projects: resolve(import.meta.dirname, 'projects/index.html'),
        certificates: resolve(import.meta.dirname, 'certificates/index.html'),
        adminLogin: resolve(import.meta.dirname, 'admin/login/index.html'),
        adminRecovery: resolve(import.meta.dirname, 'admin/recovery/index.html'),
      },
    },
  },
})
