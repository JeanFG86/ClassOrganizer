import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { Clock, Digest, IdGenerator, SeedGenerator } from '@classorganizer/core';

export const systemClock: Clock = { now: () => new Date() };

export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

export const sha256Digest: Digest = {
  of: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
};

export const randomSeeds: SeedGenerator = { next: () => randomInt(0, 2 ** 32) };
