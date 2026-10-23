import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '@classorganizer/core';

export const systemClock: Clock = { now: () => new Date() };

export const uuidGenerator: IdGenerator = { next: () => randomUUID() };
