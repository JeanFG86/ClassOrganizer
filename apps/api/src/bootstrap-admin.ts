import { bootstrapAdmin, createDatabase } from '@classorganizer/infrastructure';
import { credentialsSchema } from '@classorganizer/contracts';
import { loadConfig } from './config.ts';
// JSON pela entrada padrão: a senha não entra nos argumentos nem nos logs da aplicação.
const db = createDatabase(loadConfig().DATABASE_URL);
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 4096) throw new Error('Entrada muito grande.');
  }
  const credentials = credentialsSchema.parse(JSON.parse(input) as unknown);
  await bootstrapAdmin(db, credentials.username, credentials.password);
  process.stdout.write('Primeiro administrador criado.\n');
} catch {
  process.stderr.write(
    'Não foi possível criar o administrador. Confira a entrada, o banco e se já existe usuário cadastrado.\n',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
