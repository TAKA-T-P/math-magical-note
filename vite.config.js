import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages などのサブパス配下でも動くよう相対パスで出力する
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
