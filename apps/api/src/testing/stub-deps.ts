import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { buildApp, type AppDeps } from '../app.ts';

/** Casos de uso simulados (sem comportamento) para testes HTTP; cada teste define o que usa. */
export function stubDeps(): AppDeps {
  return {
    checkReadiness: async () => {},
    registerResource: vi.fn(),
    listResources: vi.fn(),
    updateResource: vi.fn(),
    archiveResource: vi.fn(),
    restoreResource: vi.fn(),
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
    changeTeacherAvailability: vi.fn(),
    registerClassGroup: vi.fn(),
    listClassGroups: vi.fn(),
    updateClassGroup: vi.fn(),
    changeClassGroupSchedule: vi.fn(),
    archiveClassGroup: vi.fn(),
    restoreClassGroup: vi.fn(),
    registerShift: vi.fn(),
    listShifts: vi.fn(),
    updateShift: vi.fn(),
    archiveShift: vi.fn(),
    restoreShift: vi.fn(),
    assignTeaching: vi.fn(),
    listAssignments: vi.fn(),
    changeAssignment: vi.fn(),
    removeAssignment: vi.fn(),
  };
}

export function buildTestApp(deps: Partial<AppDeps>): FastifyInstance {
  return buildApp({ ...stubDeps(), ...deps }, { logger: false });
}
