import { bindUseCase } from '../../../shared/use-case.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { InMemoryResourceRepository } from '../../../testing/in-memory-repositories.ts';
import {
  InvalidResourceNameError,
  RESOURCE_NAME_MAX_LENGTH,
  ResourceNameAlreadyInUseError,
  ResourceNotFoundError,
} from '../domain/resource.ts';
import {
  ArchiveResource,
  ListResources,
  RegisterResource,
  RestoreResource,
  UpdateResource,
} from './usecases/resources.ts';

const now = new Date('2026-03-01T10:00:00Z');

describe('recursos especiais', () => {
  let resources: InMemoryResourceRepository;
  let register: RegisterResource['execute'];
  beforeEach(() => {
    resources = new InMemoryResourceRepository();
    let sequence = 0;
    register = bindUseCase(
      new RegisterResource({
        resources,
        clock: { now: () => now },
        ids: { next: () => 'r-' + ++sequence },
      }),
    );
  });

  it('cadastra com nome limpo e lista em ordem alfabética', async () => {
    await register({ name: '  Quadra   coberta ' });
    await register({ name: 'Laboratório' });
    const list = await bindUseCase(new ListResources({ resources }))();
    expect(list.map((r) => r.name)).toEqual(['Laboratório', 'Quadra coberta']);
    expect(list[1]).toMatchObject({ id: 'r-1', archivedAt: null, version: 1 });
  });

  it('recusa nome vazio, longo demais ou repetido, ignorando acentos e maiúsculas', async () => {
    await expect(register({ name: '   ' })).rejects.toThrow(InvalidResourceNameError);
    await expect(register({ name: 'x'.repeat(RESOURCE_NAME_MAX_LENGTH + 1) })).rejects.toThrow(
      InvalidResourceNameError,
    );
    const lab = await register({ name: 'Laboratório' });
    await expect(register({ name: 'LABORATORIO' })).rejects.toThrow(ResourceNameAlreadyInUseError);
    const court = await register({ name: 'Quadra' });
    await expect(
      bindUseCase(new UpdateResource({ resources }))({
        id: court.id,
        version: 1,
        name: 'laboratório',
      }),
    ).rejects.toThrow(ResourceNameAlreadyInUseError);
    expect(await resources.findById(lab.id)).toMatchObject({ name: 'Laboratório' });
  });

  it('renomeia, arquiva e restaura com controle de versão', async () => {
    const lab = await register({ name: 'Laboratório' });
    const renamed = await bindUseCase(new UpdateResource({ resources }))({
      id: lab.id,
      version: 1,
      name: 'Laboratório de ciências',
    });
    expect(renamed).toMatchObject({ name: 'Laboratório de ciências', version: 2 });
    const archive = bindUseCase(new ArchiveResource({ resources, clock: { now: () => now } }));
    await expect(archive({ id: lab.id, version: 1 })).rejects.toThrow(StaleVersionError);
    const archived = await archive({ id: lab.id, version: 2 });
    expect(archived).toMatchObject({ archivedAt: now, version: 3 });
    expect(await archive({ id: lab.id, version: 3 })).toEqual(archived);
    const restored = await bindUseCase(new RestoreResource({ resources }))({
      id: lab.id,
      version: 3,
    });
    expect(restored).toMatchObject({ archivedAt: null, version: 4 });
    await expect(archive({ id: 'missing', version: 1 })).rejects.toThrow(ResourceNotFoundError);
  });
});
