import type { Session } from '@classorganizer/contracts';

export interface AuthenticationApi {
  session(): Promise<Session>;
  login(username: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  password(currentPassword: string, password: string): Promise<void>;
}
