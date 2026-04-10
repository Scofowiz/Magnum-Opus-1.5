import path from "node:path";

/**
 * Security Test Framework - London School TDD
 *
 * This framework implements mock-first, behavior-verification security testing
 * for CVE-1, CVE-2, and CVE-3 vulnerabilities.
 *
 * Key Principles:
 * 1. Outside-In Development: Start from user-facing behavior
 * 2. Mock Collaborators: Isolate units with clear contracts
 * 3. Behavior Verification: Focus on interactions between objects
 * 4. Contract Evolution: Adapt to new security requirements
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface SecurityTestResult {
  testId: string;
  cveId: string;
  passed: boolean;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  remediation?: string;
  executionTimeMs: number;
}

export interface SecurityTestSuite {
  name: string;
  cveId: string;
  tests: SecurityTest[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface SecurityTest {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  run: () => Promise<boolean>;
}

export interface MockRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
  send: (data: unknown) => MockResponse;
}

export interface InputValidationResult {
  valid: boolean;
  sanitized: unknown;
  errors: string[];
}

// ============================================================================
// MOCK FACTORIES - London School Pattern
// ============================================================================

/**
 * Creates a mock request object for testing
 * Follows London School principle: define collaborator contracts through mocks
 */
export function createMockRequest(
  overrides: Partial<MockRequest> = {},
): MockRequest {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  };
}

/**
 * Creates a mock response object with behavior tracking
 */
export function createMockResponse(): MockResponse & {
  statusCalledWith: number | null;
  jsonCalledWith: unknown | null;
  sendCalledWith: unknown | null;
} {
  const response: MockResponse & {
    statusCalledWith: number | null;
    jsonCalledWith: unknown | null;
    sendCalledWith: unknown | null;
  } = {
    statusCode: 200,
    body: null,
    headers: {},
    statusCalledWith: null,
    jsonCalledWith: null,
    sendCalledWith: null,
    status(code: number) {
      this.statusCode = code;
      this.statusCalledWith = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      this.jsonCalledWith = data;
      return this;
    },
    send(data: unknown) {
      this.body = data;
      this.sendCalledWith = data;
      return this;
    },
  };
  return response;
}

/**
 * Mock file system for path traversal testing
 */
export interface MockFileSystem {
  readFile: jest.Mock;
  writeFile: jest.Mock;
  exists: jest.Mock;
  readFileCalls: Array<{ path: string; encoding?: string }>;
  writeFileCalls: Array<{ path: string; content: string }>;
}

export function createMockFileSystem(): MockFileSystem {
  const readFileCalls: Array<{ path: string; encoding?: string }> = [];
  const writeFileCalls: Array<{ path: string; content: string }> = [];

  return {
    readFileCalls,
    writeFileCalls,
    readFile: jest.fn((path: string, encoding?: string) => {
      readFileCalls.push({ path, encoding });
      return Promise.resolve("mock content");
    }),
    writeFile: jest.fn((path: string, content: string) => {
      writeFileCalls.push({ path, content });
      return Promise.resolve();
    }),
    exists: jest.fn(() => Promise.resolve(true)),
  };
}

/**
 * Mock command executor for injection testing
 */
export interface MockCommandExecutor {
  exec: jest.Mock;
  execCalls: string[];
}

export function createMockCommandExecutor(): MockCommandExecutor {
  const execCalls: string[] = [];
  return {
    execCalls,
    exec: jest.fn((cmd: string) => {
      execCalls.push(cmd);
      return Promise.resolve({ stdout: "", stderr: "" });
    }),
  };
}

// ============================================================================
// SECURITY VALIDATORS - Contract Definitions
// ============================================================================

/**
 * Input sanitization contract
 * These represent the EXPECTED behavior that implementations must satisfy
 */
export interface InputSanitizer {
  sanitizeString(input: unknown): InputValidationResult;
  sanitizePath(input: unknown): InputValidationResult;
  sanitizeCommand(input: unknown): InputValidationResult;
  sanitizeObject(input: unknown, schema: ObjectSchema): InputValidationResult;
}

export interface ObjectSchema {
  properties: Record<string, PropertySchema>;
  forbiddenKeys?: string[];
}

export interface PropertySchema {
  type: "string" | "number" | "boolean" | "object" | "array";
  maxLength?: number;
  pattern?: RegExp;
  required?: boolean;
}

/**
 * Security boundary contract
 */
export interface SecurityBoundary {
  validateInput(input: unknown, context: string): InputValidationResult;
  sanitizeOutput(output: unknown): unknown;
  checkRateLimit(clientId: string, endpoint: string): boolean;
  verifyAuthentication(token: string): boolean;
}

// ============================================================================
// ATTACK PATTERN GENERATORS - For Testing Security Controls
// ============================================================================

/**
 * CVE-1: Arbitrary Code Execution Attack Patterns
 */
export const CVE1_ATTACK_PATTERNS = {
  evalInjection: [
    'eval("process.exit(1)")',
    "new Function(\"return process.mainModule.require('child_process').execSync('whoami')\")()",
    '(() => { eval(atob("cHJvY2Vzcy5leGl0KDEp")); })()',
    'constructor.constructor("return this.process")().mainModule.require("child_process").execSync("id")',
  ],
  templateLiteralInjection: [
    "${process.exit(1)}",
    '${require("child_process").execSync("whoami")}',
    '`${(() => { throw new Error("RCE"); })()}`',
  ],
  prototypeAccess: [
    "__proto__.polluted = true",
    "constructor.prototype.polluted = true",
    '["__proto__"]["polluted"] = true',
  ],
};

/**
 * CVE-2: Command Injection Attack Patterns
 */
export const CVE2_ATTACK_PATTERNS = {
  shellMetacharacters: [
    "; cat /etc/passwd",
    "| cat /etc/passwd",
    "`cat /etc/passwd`",
    "$(cat /etc/passwd)",
    "&& cat /etc/passwd",
    "|| cat /etc/passwd",
    "\n cat /etc/passwd",
    "> /tmp/pwned",
    "< /etc/passwd",
  ],
  pathTraversal: [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32\\config\\sam",
    "....//....//....//etc/passwd",
    ".%2e/.%2e/.%2e/etc/passwd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..%252f..%252f..%252fetc/passwd",
  ],
  nullByteInjection: [
    "file.txt%00.jpg",
    "file.txt\x00.jpg",
    "../../../etc/passwd%00.png",
  ],
};

/**
 * CVE-3: Prototype Pollution Attack Patterns
 */
export const CVE3_ATTACK_PATTERNS = {
  prototypeKeys: [
    "__proto__",
    "constructor",
    "prototype",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
  ],
  pollutionPayloads: [
    { __proto__: { polluted: true } },
    { constructor: { prototype: { polluted: true } } },
    { __proto__: { isAdmin: true } },
    { __proto__: { toString: (): string => "pwned" } },
    JSON.parse('{"__proto__": {"polluted": true}}'),
  ],
  nestedPollution: [
    { a: { __proto__: { polluted: true } } },
    { a: { b: { __proto__: { polluted: true } } } },
    { a: { constructor: { prototype: { polluted: true } } } },
  ],
};

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Checks if a string contains dangerous patterns for CVE-1
 */
export function containsCodeExecutionPatterns(input: string): boolean {
  const dangerousPatterns = [
    /eval\s*\(/i,
    /new\s+Function\s*\(/i,
    /setTimeout\s*\(\s*['"]/i,
    /setInterval\s*\(\s*['"]/i,
    /constructor\s*\.\s*constructor/i,
    /constructor\s*\.\s*prototype/i,
    /\$\{[^}]+\}/i,
    /__proto__/i,
    /\[\s*['"]constructor['"]\s*\]/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Checks if a string contains shell metacharacters for CVE-2
 */
export function containsShellMetacharacters(input: string): boolean {
  const dangerousChars = /[;&|`$<>\n\r\\]/;
  return dangerousChars.test(input);
}

/**
 * Checks if a path contains traversal sequences for CVE-2
 */
export function containsPathTraversal(input: string): boolean {
  const traversalPatterns = [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e/i,
    /%252e/i,
    /\.\.%2f/i,
    /\.\.%5c/i,
  ];

  return traversalPatterns.some((pattern) => pattern.test(input));
}

/**
 * Checks if an object contains prototype pollution keys for CVE-3
 */
export function containsPrototypePollutionKeys(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const forbiddenKeys = [
    "__proto__",
    "constructor",
    "prototype",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
  ];

  function checkObject(o: Record<string, unknown>, depth = 0): boolean {
    if (depth > 10) return false; // Prevent infinite recursion

    for (const key of Object.keys(o)) {
      if (forbiddenKeys.includes(key)) {
        return true;
      }
      if (typeof o[key] === "object" && o[key] !== null) {
        if (checkObject(o[key] as Record<string, unknown>, depth + 1)) {
          return true;
        }
      }
    }
    return false;
  }

  return checkObject(obj as Record<string, unknown>);
}

/**
 * Safe object merge that prevents prototype pollution
 */
export function safeMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const forbiddenKeys = [
    "__proto__",
    "constructor",
    "prototype",
    "__defineGetter__",
    "__defineSetter__",
  ];

  for (const key of Object.keys(source)) {
    if (forbiddenKeys.includes(key)) {
      continue; // Skip forbidden keys
    }

    const sourceValue = source[key];
    if (
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      (target as Record<string, unknown>)[key] = safeMerge(
        ((target as Record<string, unknown>)[key] as Record<string, unknown>) ||
          {},
        sourceValue as Record<string, unknown>,
      );
    } else {
      (target as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return target;
}

/**
 * Sanitizes a file path to prevent traversal attacks
 */
export function sanitizePath(input: string, baseDir: string): string | null {
  // Normalize and resolve the path
  const normalized = path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.resolve(baseDir, normalized);

  // Ensure the resolved path is within the base directory
  if (!resolved.startsWith(path.resolve(baseDir))) {
    return null; // Path traversal detected
  }

  return resolved;
}

/**
 * Escapes shell metacharacters
 */
export function escapeShellArg(input: string): string {
  return `'${input.replace(/'/g, "'\\''")}'`;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

export class SecurityTestRunner {
  private results: SecurityTestResult[] = [];
  private suites: SecurityTestSuite[] = [];

  registerSuite(suite: SecurityTestSuite): void {
    this.suites.push(suite);
  }

  async runAll(): Promise<SecurityTestResult[]> {
    this.results = [];

    for (const suite of this.suites) {
      console.log(
        `\n[Security Test] Running suite: ${suite.name} (${suite.cveId})`,
      );

      if (suite.setup) {
        await suite.setup();
      }

      for (const test of suite.tests) {
        const startTime = Date.now();
        let passed = false;

        try {
          passed = await test.run();
        } catch (error) {
          console.error(`  [FAIL] ${test.name}: ${error}`);
          passed = false;
        }

        const result: SecurityTestResult = {
          testId: test.id,
          cveId: suite.cveId,
          passed,
          severity: test.severity,
          description: test.description,
          executionTimeMs: Date.now() - startTime,
        };

        this.results.push(result);
        console.log(`  [${passed ? "PASS" : "FAIL"}] ${test.name}`);
      }

      if (suite.teardown) {
        await suite.teardown();
      }
    }

    return this.results;
  }

  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    byCve: Record<string, { passed: number; failed: number }>;
    bySeverity: Record<string, { passed: number; failed: number }>;
  } {
    const summary = {
      total: this.results.length,
      passed: this.results.filter((r) => r.passed).length,
      failed: this.results.filter((r) => !r.passed).length,
      byCve: {} as Record<string, { passed: number; failed: number }>,
      bySeverity: {} as Record<string, { passed: number; failed: number }>,
    };

    for (const result of this.results) {
      // By CVE
      if (!summary.byCve[result.cveId]) {
        summary.byCve[result.cveId] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        summary.byCve[result.cveId].passed++;
      } else {
        summary.byCve[result.cveId].failed++;
      }

      // By Severity
      if (!summary.bySeverity[result.severity]) {
        summary.bySeverity[result.severity] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        summary.bySeverity[result.severity].passed++;
      } else {
        summary.bySeverity[result.severity].failed++;
      }
    }

    return summary;
  }
}

// Export singleton runner instance
export const securityTestRunner = new SecurityTestRunner();
