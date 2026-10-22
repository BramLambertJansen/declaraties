import {
  accountsListContract,
  activateContract,
  blockContract,
  deactivateContract,
  inviteContract,
  reinviteContract,
  unblockContract,
} from './accounts.ts';
import {
  confirmEmailContract,
  meContract,
  renameContract,
  revokeOtherSessionsContract,
  revokeSessionContract,
  sessionsListContract,
} from './me.ts';

// Alle route-contracten van de app; de web-client is hierop getypt (src/web/lib/api.ts).
export const contracts = [
  meContract,
  renameContract,
  sessionsListContract,
  revokeSessionContract,
  revokeOtherSessionsContract,
  confirmEmailContract,
  accountsListContract,
  inviteContract,
  reinviteContract,
  blockContract,
  unblockContract,
  deactivateContract,
  activateContract,
] as const;
export type Contracts = typeof contracts;
