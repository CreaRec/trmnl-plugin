import { describe, expect, it } from "vitest";
import {
  TEST_DEFAULT_POLL_TOKEN,
  extractPollToken,
  isAuthorizedPollRequest,
  resolvePollToken,
  tokensEqual,
} from "../src/poll-auth.js";

describe("poll-auth", () => {
  it("resolvePollToken prefers env", () => {
    expect(
      resolvePollToken({ TRMNL_POLL_TOKEN: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }),
    ).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });

  it("resolvePollToken uses test default when unset outside production", () => {
    expect(resolvePollToken({ NODE_ENV: "test" })).toBe(TEST_DEFAULT_POLL_TOKEN);
    expect(resolvePollToken({})).toBe(TEST_DEFAULT_POLL_TOKEN);
  });

  it("resolvePollToken throws in production when unset", () => {
    expect(() =>
      resolvePollToken({ NODE_ENV: "production" }),
    ).toThrow(/TRMNL_POLL_TOKEN/);
  });

  it("tokensEqual is timing-safe and rejects mismatches", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("abc", "ab")).toBe(false);
  });

  it("extractPollToken supports path and query forms", () => {
    const tok = "11111111-2222-4333-8444-555555555555";
    expect(extractPollToken(`/poll/${tok}`, `/poll/${tok}`)).toBe(tok);
    expect(extractPollToken(`/t/${tok}`, `/t/${tok}`)).toBe(tok);
    expect(extractPollToken(`/?token=${tok}`, "/")).toBe(tok);
    expect(extractPollToken(`/poll?token=${tok}`, "/poll")).toBe(tok);
    expect(extractPollToken("/", "/")).toBeNull();
    expect(extractPollToken("/poll", "/poll")).toBeNull();
  });

  it("isAuthorizedPollRequest compares with expected token", () => {
    const tok = "11111111-2222-4333-8444-555555555555";
    expect(isAuthorizedPollRequest(`/poll/${tok}`, `/poll/${tok}`, tok)).toBe(
      true,
    );
    expect(
      isAuthorizedPollRequest(`/poll/${tok}`, `/poll/${tok}`, "wrong"),
    ).toBe(false);
  });
});
