import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Carrega variáveis do .env da raiz do projeto
dotenv.config({ path: resolve(__dirname, '../.env') });

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    // Expõe VITE_API_URL do .env da raiz para o frontend
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || process.env.VITE_API_URL?.replace(/"/g, '') || 'http://localhost:3001'),
  },
})
