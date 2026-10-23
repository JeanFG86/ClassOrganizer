import { mkdir } from 'node:fs/promises';
import { request, type FullConfig } from '@playwright/test';

export default async function setup(config: FullConfig) {
  const context = await request.newContext({
    baseURL: config.projects[0]?.use.baseURL ?? 'http://localhost:8080',
    extraHTTPHeaders: { 'x-entreaulas-client': 'web' },
  });
  const response = await context.post('/api/v1/auth/login', {
    data: {
      username: process.env['E2E_USERNAME'] ?? 'e2e-admin',
      password: process.env['E2E_PASSWORD'] ?? 'senha ficticia e2e 2026!',
    },
  });
  if (!response.ok())
    throw new Error(
      'Crie o administrador E2E no banco de teste antes da suíte. HTTP ' + response.status(),
    );
  await mkdir('.auth', { recursive: true });
  await context.storageState({ path: '.auth/state.json' });
  await context.dispose();
}
