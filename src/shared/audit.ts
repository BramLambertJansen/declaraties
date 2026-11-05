import { defineAuditActions } from '#core/shared/audit.ts';

// Auditacties van de app (ADR 0051, ADR 0040): sleutel `<onderwerp>.<actie>`, nooit met het voorvoegsel `core.`.
export const auditActions = defineAuditActions({});
