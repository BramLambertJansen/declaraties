// assert(cond, msg) (framework §4): actief in productie. In de API maakt onError er INTERNAL_ERROR van; in de frontend vangt
// de ErrorBoundary per route hem op. Melden aan de fouttracking volgt met reportClientError (fase 2).
export class AssertionError extends Error {
  override readonly name = 'AssertionError';
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionError(message);
}
