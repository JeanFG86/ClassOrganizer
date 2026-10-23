import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { buildApp, type AppDeps } from '../app.ts';

/** Casos de uso simulados (sem comportamento) para testes HTTP; cada teste define o que usa. */
export function stubDeps(): AppDeps {
  return {
    checkReadiness: async () => {},
    registerSubject: vi.fn(),
    listSubjects: vi.fn(),
    updateSubject: vi.fn(),
    archiveSubject: vi.fn(),
    restoreSubject: vi.fn(),
    registerTeacher: vi.fn(),
    listTeachers: vi.fn(),
    updateTeacher: vi.fn(),
    archiveTeacher: vi.fn(),
    restoreTeacher: vi.fn(),
    registerClassGroup: vi.fn(),
    listClassGroups: vi.fn(),
    updateClassGroup: vi.fn(),
    archiveClassGroup: vi.fn(),
    restoreClassGroup: vi.fn(),
    assignTeaching: vi.fn(),
    listAssignments: vi.fn(),
    changeAssignment: vi.fn(),
    removeAssignment: vi.fn(),
  };
}

export function buildTestApp(deps: Partial<AppDeps>): FastifyInstance {
  return buildApp({ ...stubDeps(), ...deps }, { logger: false });
}
