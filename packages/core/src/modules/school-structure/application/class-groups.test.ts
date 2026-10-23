import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryClassGroupRepository } from '../../../testing/in-memory-repositories.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import {
  ClassGroupNameAlreadyInUseError,
  ClassGroupNotFoundError,
  InvalidClassGroupNameError,
} from '../domain/class-group.ts';
import {
  makeArchiveClassGroup,
  makeListClassGroups,
  makeRegisterClassGroup,
  makeRestoreClassGroup,
  makeUpdateClassGroup,
} from './class-groups.ts';

const now = new Date('2026-02-01T12:00:00Z');

describe('turmas', () => {
  let classGroups: InMemoryClassGroupRepository;
  let register: ReturnType<typeof makeRegisterClassGroup>;
  let update: ReturnType<typeof makeUpdateClassGroup>;
  let archive: ReturnType<typeof makeArchiveClassGroup>;
  let restore: ReturnType<typeof makeRestoreClassGroup>;

  beforeEach(() => {
    classGroups = new InMemoryClassGroupRepository();
    const clock = { now: () => now };
    let sequence = 0;
    register = makeRegisterClassGroup({
      classGroups,
      clock,
      ids: { next: () => `c-${++sequence}` },
    });
    update = makeUpdateClassGroup({ classGroups });
    archive = makeArchiveClassGroup({ classGroups, clock });
    restore = makeRestoreClassGroup({ classGroups });
  });

  it('cadastra ativa na versão 1 com nome limpo', async () => {
    const turma = await register({ name: '  6º  ano A ' });

    expect(turma).toEqual({
      id: 'c-1',
      name: '6º ano A',
      normalizedName: '6º ano a',
      shiftId: null,
      periodIds: [],
      createdAt: now,
      archivedAt: null,
      version: 1,
    });
  });

  it.each(['', '   ', 'x'.repeat(41)])('rejeita nome inválido (%j)', async (name) => {
    await expect(register({ name })).rejects.toThrow(InvalidClassGroupNameError);
  });

  it('impede nome repetido, orientando a restaurar se estiver arquivada', async () => {
    const turma = await register({ name: '6º ano A' });
    await expect(register({ name: '6º ANO a' })).rejects.toThrow(
      'Já existe uma turma chamada "6º ano A".',
    );

    await archive({ id: turma.id, version: 1 });
    await expect(register({ name: '6º ano A' })).rejects.toThrow(/turma arquivada.*Restaure-a/);
  });

  it('lista em ordem alfabética', async () => {
    for (const name of ['7º ano B', '6º ano A', '7º ano A']) {
      await register({ name });
    }

    const names = (await makeListClassGroups({ classGroups })()).map((c) => c.name);

    expect(names).toEqual(['6º ano A', '7º ano A', '7º ano B']);
  });

  it('renomeia com controle de versão', async () => {
    const turma = await register({ name: '6A' });

    await expect(update({ id: turma.id, version: 1, name: '6º ano A' })).resolves.toMatchObject({
      name: '6º ano A',
      version: 2,
    });
    await expect(update({ id: turma.id, version: 1, name: 'Outro' })).rejects.toThrow(
      StaleVersionError,
    );
  });

  it('impede renomear para o nome de outra turma', async () => {
    await register({ name: '6º ano A' });
    const b = await register({ name: '6º ano B' });

    await expect(update({ id: b.id, version: 1, name: '6º ano a' })).rejects.toThrow(
      ClassGroupNameAlreadyInUseError,
    );
  });

  it('arquiva e restaura', async () => {
    const turma = await register({ name: '6º ano A' });

    await expect(archive({ id: turma.id, version: 1 })).resolves.toMatchObject({
      archivedAt: now,
      version: 2,
    });
    await expect(restore({ id: turma.id, version: 2 })).resolves.toMatchObject({
      archivedAt: null,
      version: 3,
    });
  });

  it('informa turma inexistente', async () => {
    await expect(archive({ id: 'nada', version: 1 })).rejects.toThrow(ClassGroupNotFoundError);
  });
});
