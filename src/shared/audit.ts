import { defineAuditActions } from '#core/shared/audit.ts';

// Auditacties van de app (ADR 0021, ADR 0008): sleutel `<onderwerp>.<actie>`, nooit met het voorvoegsel `core.`.
export const auditActions = defineAuditActions({});
