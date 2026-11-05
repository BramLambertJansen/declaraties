import { createContracts } from '#core/shared/contract.ts';
import { permissions } from '../permissions.ts';

export const { defineContract } = createContracts(permissions);
