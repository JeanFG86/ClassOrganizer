import { type UserAccountDto } from '@classorganizer/contracts';

export interface AccountsApi {
  users(): Promise<UserAccountDto[]>;
  createUser(
    username: string,
    password: string,
    role: UserAccountDto['role'],
  ): Promise<UserAccountDto>;
  changeUser(
    user: UserAccountDto,
    role: UserAccountDto['role'],
    disabled: boolean,
    password?: string,
  ): Promise<UserAccountDto>;
}
