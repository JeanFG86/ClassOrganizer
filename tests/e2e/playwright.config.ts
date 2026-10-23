import { defineConfig, devices } from '@playwright/test';

// Os testes E2E rodam contra a aplicação completa já em execução
// (por padrão, o Compose em http://localhost:8080). Ver README.
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
