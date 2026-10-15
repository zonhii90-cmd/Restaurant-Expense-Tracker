import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths work on GitHub Pages' /Restaurant-Expense-Tracker/ URL
// as well as on a custom domain. The app has no client-side URL routing.
export default defineConfig({ base: './', plugins: [react()] });
