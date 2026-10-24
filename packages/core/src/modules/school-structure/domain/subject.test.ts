import { describe, expect, it } from 'vitest';
import {
  InvalidSubjectNameError,
  SUBJECT_NAME_MAX_LENGTH,
  createSubject,
  normalizeSubjectName,
  SubjectEntity,
} from './subject.ts';

const createdAt = new Date('2026-02-01T12:00:00Z');

describe('createSubject', () => {
  it('limpa espaços extras do nome', () => {
    const subject = createSubject({ id: 's1', name: '  Língua   Portuguesa ', createdAt });

    expect(subject.name).toBe('Língua Portuguesa');
  });

  it('gera chave normalizada sem acentos nem maiúsculas', () => {
    const subject = createSubject({ id: 's1', name: 'Educação Física', createdAt });

    expect(subject.normalizedName).toBe('educacao fisica');
  });

  it.each(['', '   '])('rejeita nome vazio (%j)', (name) => {
    expect(() => createSubject({ id: 's1', name, createdAt })).toThrow(InvalidSubjectNameError);
  });

  it('aceita nome no limite de tamanho', () => {
    const name = 'a'.repeat(SUBJECT_NAME_MAX_LENGTH);

    expect(createSubject({ id: 's1', name, createdAt }).name).toBe(name);
  });

  it('rejeita nome acima do limite de tamanho', () => {
    const name = 'a'.repeat(SUBJECT_NAME_MAX_LENGTH + 1);

    expect(() => createSubject({ id: 's1', name, createdAt })).toThrow(InvalidSubjectNameError);
  });
});

describe('SubjectEntity', () => {
  it('reconstitui uma fotografia sem redefinir identidade, versão ou datas', () => {
    const state = {
      ...createSubject({ id: 's1', name: 'Oficina fictícia', createdAt }),
      version: 7,
      archivedAt: createdAt,
    };
    const entity = SubjectEntity.reconstitute(state);
    expect(entity.snapshot()).toEqual(state);
    expect(entity.restore().snapshot()).toEqual({ ...state, archivedAt: null });
    expect(entity.snapshot()).toEqual(state);
  });

  it('renomeia sem alterar a fotografia original nem sua versão', () => {
    const entity = SubjectEntity.create({ id: 's1', name: 'Oficina fictícia', createdAt });
    const renamed = entity.rename('  Oficina   experimental ');
    expect(renamed.snapshot()).toMatchObject({
      name: 'Oficina experimental',
      normalizedName: 'oficina experimental',
      version: 1,
    });
    expect(entity.snapshot().name).toBe('Oficina fictícia');
  });
});

describe('normalizeSubjectName', () => {
  it('considera equivalentes nomes que só diferem em acento, caixa e espaços', () => {
    expect(normalizeSubjectName(' MATEMÁTICA ')).toBe(normalizeSubjectName('matematica'));
  });
});
