import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS tarvitaan, jotta puhelimen asentoanturi ja Gamepad API toimivat.
// host: true -> peliin pääsee puhelimella samasta kotiverkosta.
// `npm run dev:http` käynnistää ilman HTTPS:ää (testaus tietokoneella).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'http' ? [] : [basicSsl()],
  server: { host: true },
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
}));
