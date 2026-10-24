import { bindUseCase } from '../../../shared/use-case.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { StaleVersionError } from '../../../shared/versioning.ts';
import {
  InvalidSubjectNameError,
  SubjectNameAlreadyInUseError,
  SubjectNotFoundError,
  type Subject,
} from '../domain/subject.ts';
import { ArchiveSubject, RestoreSubject, UpdateSubject } from './usecases/change-subject.ts';
import { ListSubjects } from './queries/list-subjects.ts';
import { RegisterSubject } from './usecases/register-subject.ts';
import type { SubjectRepository } from './ports/subject-repository.ts';

class InMemorySubjectRepository implements SubjectRepository {
  readonly items = new Map<string, Subject>();

  async findById(id: string): Promise<Subject | null> {
    return this.items.get(id) ?? null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Subject | null> {
    return [...this.items.values()].find((s) => s.normalizedName === normalizedName) ?? null;
  }

  async add(subject: Subject): Promise<void> {
    this.items.set(subject.id, subject);
  }

  async update(subject: Subject): Promise<Subject> {
    if (this.items.get(subject.id)?.version !== subject.version) {
      throw new StaleVersionError();
    }
    const saved = { ...subject, version: subject.version + 1 };
    this.items.set(subject.id, saved);
    return saved;
  }

  async listAll(): Promise<Subject[]> {
    return [...this.items.values()];
  }
}

const now = new Date('2026-02-01T12:00:00Z');
const later = new Date('2026-03-01T12:00:00Z');

describe('disciplinas', () => {
  let subjects: InMemorySubjectRepository;
  let clockNow: Date;
  let registerSubject: RegisterSubject['execute'];
  let updateSubject: UpdateSubject['execute'];
  let archive: ArchiveSubject['execute'];
  let restore: RestoreSubject['execute'];

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    clockNow = now;
    let sequence = 0;
    const clock = { now: () => clockNow };
    registerSubject = bindUseCase(
      new RegisterSubject({
        subjects,
        clock,
        ids: { next: () => `id-${++sequence}` },
      }),
    );
    updateSubject = bindUseCase(new UpdateSubject({ subjects }));
    archive = bindUseCase(new ArchiveSubject({ subjects, clock }));
    restore = bindUseCase(new RestoreSubject({ subjects }));
  });

  describe('cadastro', () => {
    it('cadastra ativa, na versão 1, com id e data injetados', async () => {
      const subject = await registerSubject({ name: 'Matemática' });

      expect(subject).toEqual({
        id: 'id-1',
        name: 'Matemática',
        normalizedName: 'matematica',
        createdAt: now,
        archivedAt: null,
        version: 1,
      });
      expect([...subjects.items.values()]).toEqual([subject]);
    });

    it('impede nome equivalente a uma disciplina existente', async () => {
      await registerSubject({ name: 'Matemática' });

      await expect(registerSubject({ name: '  MATEMATICA ' })).rejects.toThrow(
        'Já existe uma disciplina chamada "Matemática".',
      );
      expect(subjects.items.size).toBe(1);
    });

    it('orienta a restaurar quando o nome pertence a uma disciplina arquivada', async () => {
      const math = await registerSubject({ name: 'Matemática' });
      await archive({ id: math.id, version: math.version });

      await expect(registerSubject({ name: 'matemática' })).rejects.toThrow(
        /disciplina arquivada chamada "Matemática"\. Restaure-a/,
      );
    });

    it('não grava quando o nome é inválido', async () => {
      await expect(registerSubject({ name: ' ' })).rejects.toThrow(InvalidSubjectNameError);
      expect(subjects.items.size).toBe(0);
    });

    it('lista em ordem alfabética respeitando acentos', async () => {
      for (const name of ['Química', 'Artes', 'Ética', 'Biologia']) {
        await registerSubject({ name });
      }

      const names = (await bindUseCase(new ListSubjects({ subjects }))()).map((s) => s.name);

      expect(names).toEqual(['Artes', 'Biologia', 'Ética', 'Química']);
    });
  });

  describe('edição', () => {
    it('renomeia e incrementa a versão', async () => {
      const math = await registerSubject({ name: 'Matematica' });

      const updated = await updateSubject({ id: math.id, version: 1, name: 'Matemática' });

      expect(updated).toMatchObject({
        name: 'Matemática',
        normalizedName: 'matematica',
        version: 2,
      });
    });

    it('permite mudar só acentos ou caixa do próprio nome', async () => {
      const math = await registerSubject({ name: 'matematica' });

      await expect(
        updateSubject({ id: math.id, version: 1, name: 'Matemática' }),
      ).resolves.toMatchObject({ name: 'Matemática' });
    });

    it('impede renomear para o nome de outra disciplina', async () => {
      await registerSubject({ name: 'História' });
      const geo = await registerSubject({ name: 'Geografia' });

      await expect(updateSubject({ id: geo.id, version: 1, name: 'historia' })).rejects.toThrow(
        SubjectNameAlreadyInUseError,
      );
      expect((await subjects.findById(geo.id))?.name).toBe('Geografia');
    });

    it('rejeita alteração baseada em versão antiga sem gravar', async () => {
      const math = await registerSubject({ name: 'Matemática' });
      await updateSubject({ id: math.id, version: 1, name: 'Matemática I' });

      await expect(updateSubject({ id: math.id, version: 1, name: 'Mat' })).rejects.toThrow(
        StaleVersionError,
      );
      expect((await subjects.findById(math.id))?.name).toBe('Matemática I');
    });

    it('informa disciplina inexistente', async () => {
      await expect(updateSubject({ id: 'nada', version: 1, name: 'X' })).rejects.toThrow(
        SubjectNotFoundError,
      );
    });
  });

  describe('arquivamento', () => {
    it('arquiva com a data do relógio e restaura', async () => {
      const math = await registerSubject({ name: 'Matemática' });
      clockNow = later;

      const archived = await archive({ id: math.id, version: 1 });
      expect(archived).toMatchObject({ archivedAt: later, version: 2 });

      const restored = await restore({ id: math.id, version: 2 });
      expect(restored).toMatchObject({ archivedAt: null, version: 3 });
    });

    it('arquivar o que já está arquivado não altera nada', async () => {
      const math = await registerSubject({ name: 'Matemática' });
      const archived = await archive({ id: math.id, version: 1 });

      await expect(archive({ id: math.id, version: 2 })).resolves.toEqual(archived);
    });

    it('arquivamento também respeita a versão', async () => {
      const math = await registerSubject({ name: 'Matemática' });
      await updateSubject({ id: math.id, version: 1, name: 'Matemática I' });

      await expect(archive({ id: math.id, version: 1 })).rejects.toThrow(StaleVersionError);
    });
  });
});
