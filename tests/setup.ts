/**
 * Global test setup for London School TDD
 *
 * This file configures the test environment with:
 * - Mock factories for dependency injection
 * - Custom matchers for behavior verification
 * - Global test utilities
 */

import { vi, expect } from "vitest";

const DEFAULT_TEST_TIME = new Date("2025-01-01T00:00:00.000Z");

// Extend expect with custom matchers for London School TDD
expect.extend({
  /**
   * Verify that a mock was called before another mock
   */
  toHaveBeenCalledBefore(
    received: ReturnType<typeof vi.fn>,
    other: ReturnType<typeof vi.fn>,
  ): { pass: boolean; message: () => string } {
    const receivedCalls = received.mock.invocationCallOrder;
    const otherCalls = other.mock.invocationCallOrder;

    if (receivedCalls.length === 0) {
      return {
        pass: false,
        message: (): string =>
          `expected ${received.getMockName()} to have been called, but it was not`,
      };
    }

    if (otherCalls.length === 0) {
      return {
        pass: true,
        message: (): string =>
          `${received.getMockName()} was called but ${other.getMockName()} was never called`,
      };
    }

    const firstReceivedCall = Math.min(...receivedCalls);
    const firstOtherCall = Math.min(...otherCalls);

    return {
      pass: firstReceivedCall < firstOtherCall,
      message: (): string =>
        `expected ${received.getMockName()} to have been called before ${other.getMockName()}`,
    };
  },

  /**
   * Verify interaction sequence
   */
  toHaveInteractionSequence(
    mocks: ReturnType<typeof vi.fn>[],
    expectedSequence: string[],
  ): { pass: boolean; message: () => string } {
    const actualSequence: { name: string; order: number }[] = [];

    mocks.forEach((mock) => {
      mock.mock.invocationCallOrder.forEach((order) => {
        actualSequence.push({ name: mock.getMockName(), order });
      });
    });

    actualSequence.sort((a, b) => a.order - b.order);
    const actualNames = actualSequence.map((s) => s.name);

    const pass =
      JSON.stringify(actualNames) === JSON.stringify(expectedSequence);

    return {
      pass,
      message: (): string =>
        `expected interaction sequence ${JSON.stringify(expectedSequence)}, but got ${JSON.stringify(actualNames)}`,
    };
  },
});

// Declare custom matchers for TypeScript
declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveBeenCalledBefore(other: ReturnType<typeof vi.fn>): T;
    toHaveInteractionSequence(expectedSequence: string[]): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveBeenCalledBefore(other: ReturnType<typeof vi.fn>): unknown;
    toHaveInteractionSequence(expectedSequence: string[]): unknown;
  }
}

// Global test utilities
globalThis.createSpyWithName = (name: string): ReturnType<typeof vi.fn> => {
  const spy = vi.fn();
  spy.mockName(name);
  return spy;
};
(globalThis as typeof globalThis & { jest: typeof vi }).jest = vi;

// Mock timers for session/cache tests
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(DEFAULT_TEST_TIME);

// Cleanup after each test
afterEach((): void => {
  vi.clearAllMocks();
  vi.setSystemTime(DEFAULT_TEST_TIME);
});
