import { describe, expect, it } from 'vitest';
import {
  InvalidSubjectNameError,
  SUBJECT_NAME_MAX_LENGTH,
  SubjectName,
  SubjectEntity,
} from './subject.ts';

const createdAt = new Date('2026-02-01T12:00:00Z');

describe('SubjectEntity.create', () => {
  it('limpa espaços extras do nome', () => {
    const subject = SubjectEntity.create({
      id: 's1',
      name: '  Língua   Portuguesa ',
      createdAt,
    }).snapshot();

    expect(subject.name).toBe('Língua Portuguesa');
  });

  it('gera chave normalizada sem acentos nem maiúsculas', () => {
    const subject = SubjectEntity.create({
      id: 's1',
      name: 'Educação Física',
      createdAt,
    }).snapshot();

    expect(subject.normalizedName).toBe('educacao fisica');
  });

  it.each(['', '   '])('rejeita nome vazio (%j)', (name) => {
    expect(() => SubjectEntity.create({ id: 's1', name, createdAt }).snapshot()).toThrow(
      InvalidSubjectNameError,
    );
  });

  it('aceita nome no limite de tamanho', () => {
    const name = 'a'.repeat(SUBJECT_NAME_MAX_LENGTH);

    expect(SubjectEntity.create({ id: 's1', name, createdAt }).snapshot().name).toBe(name);
  });

  it('rejeita nome acima do limite de tamanho', () => {
    const name = 'a'.repeat(SUBJECT_NAME_MAX_LENGTH + 1);

    expect(() => SubjectEntity.create({ id: 's1', name, createdAt }).snapshot()).toThrow(
      InvalidSubjectNameError,
    );
  });
});

describe('SubjectEntity', () => {
  it('reconstitui uma fotografia sem redefinir identidade, versão ou datas', () => {
    const state = {
      ...SubjectEntity.create({ id: 's1', name: 'Oficina fictícia', createdAt }).snapshot(),
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

describe('SubjectName', () => {
  it('considera equivalentes nomes que só diferem em acento, caixa e espaços', () => {
    expect(new SubjectName(' MATEMÁTICA ').normalized).toBe(
      new SubjectName('matematica').normalized,
    );
  });
});
