import { expect, test } from "bun:test";
import { HttpError, withRetry } from "./http";

const flaky = (failures: unknown[]) => {
  let calls = 0;
  return {
    attempt: async () => {
      const failure = failures[calls++];
      if (failure) throw failure;
      return "ok";
    },
    calls: () => calls,
  };
};

test("a timeout is retried once and then succeeds", async () => {
  const source = flaky([new DOMException("The operation timed out.", "TimeoutError")]);
  expect(await withRetry(source.attempt, 0)).toBe("ok");
  expect(source.calls()).toBe(2);
});

test("a 503 is retried once", async () => {
  const source = flaky([new HttpError(503, "https://example.com"), new HttpError(503, "https://example.com")]);
  await expect(withRetry(source.attempt, 0)).rejects.toThrow("HTTP 503");
  expect(source.calls()).toBe(2);
});

test("a 429 is retried up to three times", async () => {
  const limited = () => new HttpError(429, "https://example.com", 0);
  const recovers = flaky([limited(), limited(), limited()]);
  expect(await withRetry(recovers.attempt, 0)).toBe("ok");
  expect(recovers.calls()).toBe(4);

  const stays = flaky([limited(), limited(), limited(), limited()]);
  await expect(withRetry(stays.attempt, 0)).rejects.toThrow("HTTP 429");
  expect(stays.calls()).toBe(4);
});

test("a 404 fails at once without retrying", async () => {
  const source = flaky([new HttpError(404, "https://example.com")]);
  await expect(withRetry(source.attempt, 0)).rejects.toThrow("HTTP 404");
  expect(source.calls()).toBe(1);
});

test("a second failure is reported", async () => {
  const source = flaky([new Error("reset"), new Error("reset again")]);
  await expect(withRetry(source.attempt, 0)).rejects.toThrow("reset again");
  expect(source.calls()).toBe(2);
});
