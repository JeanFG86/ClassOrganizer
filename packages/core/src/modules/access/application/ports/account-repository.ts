import { type UserAccount } from '../../domain/access.ts';
export interface StoredUser extends UserAccount {
  passwordHash: string;
}
export interface AccountRepository {
  list(): Promise<StoredUser[]>;
  find(id: string): Promise<StoredUser | null>;
  findUsername(username: string): Promise<StoredUser | null>;
  activeAdmins(): Promise<number>;
  add(user: StoredUser): Promise<void>;
  update(user: StoredUser, expectedVersion: number): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
}
export interface PasswordService {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
