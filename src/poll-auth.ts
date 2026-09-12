import { timingSafeEqual } from "node:crypto";

/** Fixed UUID used when TRMNL_POLL_TOKEN is unset outside production (tests / local). */
export const TEST_DEFAULT_POLL_TOKEN = "00000000-0000-4000-8000-000000000001";

export function isProductionEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.NODE_ENV?.trim() || "").toLowerCase() === "production";
}

/**
 * Resolve the expected poll token.
 * - Production: TRMNL_POLL_TOKEN is required (non-empty).
 * - Non-production: use env if set; otherwise the test default (so local/tests can auth).
 */
export function resolvePollToken(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.TRMNL_POLL_TOKEN?.trim() ?? "";
  if (raw) return raw;
  if (isProductionEnv(env)) {
    throw new Error(
      "TRMNL_POLL_TOKEN is required in production (set a UUID in .env)",
    );
  }
  return TEST_DEFAULT_POLL_TOKEN;
}

/** Startup guard — call from the process entrypoint. */
export function assertPollTokenConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  resolvePollToken(env);
}

/** Constant-time string compare (length mismatch → false, no early equal). */
export function tokensEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    // Touch both buffers so length mismatch is not a fast path alone.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Extract a candidate token from authorized poll URL shapes:
 * - /poll/<token>, /t/<token>
 * - /?token=…, /poll?token=…
 */
export function extractPollToken(
  rawUrl: string | undefined,
  path: string,
): string | null {
  const pollPath = /^\/poll\/([^/]+)$/.exec(path);
  if (pollPath?.[1]) {
    try {
      return decodeURIComponent(pollPath[1]);
    } catch {
      return pollPath[1];
    }
  }

  const shortPath = /^\/t\/([^/]+)$/.exec(path);
  if (shortPath?.[1]) {
    try {
      return decodeURIComponent(shortPath[1]);
    } catch {
      return shortPath[1];
    }
  }

  if (path === "/" || path === "/poll") {
    try {
      const u = new URL(rawUrl ?? "/", "http://127.0.0.1");
      const q = u.searchParams.get("token");
      return q != null && q !== "" ? q : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function isAuthorizedPollRequest(
  rawUrl: string | undefined,
  path: string,
  expectedToken: string,
): boolean {
  const provided = extractPollToken(rawUrl, path);
  if (provided == null) return false;
  return tokensEqual(expectedToken, provided);
}
