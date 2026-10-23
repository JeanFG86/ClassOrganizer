import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { validateTimetableProposal } from '@classorganizer/core';
import { demonstrationOptions, makeSyntheticTimetable } from './synthetic-fixture.ts';

const input = process.argv[2];
const output = process.argv[3];
try {
  if (!input || !output || resolve(input) === resolve(output))
    throw new Error('Informe arquivos distintos de configuração e saída.');
  const count = z.number().int().nonnegative();
  const volume = z
    .object({
      classGroups: count,
      teachers: count,
      lessons: count,
      assignments: count,
      planningPeriods: count,
      periodsPerDay: count,
      shifts: count,
    })
    .parse(JSON.parse(await readFile(input, 'utf8')));
  const { snapshot, witness } = makeSyntheticTimetable(volume);
  if (validateTimetableProposal(snapshot, witness).length)
    throw new Error('A testemunha sintética é inválida.');
  await writeFile(
    output,
    JSON.stringify({ snapshot, options: demonstrationOptions }, null, 2) + '\n',
  );
  process.stdout.write('Entrada sintética criada; a testemunha não foi incluída no arquivo.\n');
} catch {
  process.stderr.write(
    'Não foi possível gerar o cenário. Confira a configuração de volume e os caminhos.\n',
  );
  process.exitCode = 2;
}
