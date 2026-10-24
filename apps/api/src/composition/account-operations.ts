import {
  bindUseCase,
  ListAccounts,
  CreateAccount,
  ChangeAccount,
  ChangePassword,
  type ManageAccountsDependencies,
} from '@classorganizer/core';
export function composeManageAccounts(deps: ManageAccountsDependencies) {
  return {
    list: bindUseCase(new ListAccounts(deps)),
    create: bindUseCase(new CreateAccount(deps)),
    change: bindUseCase(new ChangeAccount(deps)),
    changePassword: bindUseCase(new ChangePassword(deps)),
  };
}
