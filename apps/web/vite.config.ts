import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Mesmo domínio para a API em desenvolvimento, como no Nginx do perfil de uso.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
