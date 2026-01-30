export const PRISMA_P1001 = 'P1001';

export function isP1001(e: unknown): boolean {
  return (e as { code?: string })?.code === PRISMA_P1001;
}

/**
 * Retry a Prisma/DB operation on connection errors (P1001).
 * Use in cron jobs and request handlers to tolerate temporary DB unavailability.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delayMs?: number; logPrefix?: string } = {}
): Promise<T> {
  const { retries = 3, delayMs = 2000, logPrefix = '[DB]' } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastError = e;
      if (isP1001(e) && attempt < retries) {
        console.warn(`${logPrefix} Database unreachable (P1001), attempt ${attempt}/${retries}, retrying in ${delayMs * attempt}ms...`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
