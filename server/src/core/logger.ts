/**
 * Structured Logging Module
 *
 * Provides consistent logging across the application with:
 * - Color-coded console output
 * - File-based persistence
 * - In-memory buffer for recent logs
 */

import fs from "fs";
import path from "path";
import { LogLevel, LogEntry, Logger } from "./types.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";
const MAX_LOG_BUFFER = 500;

// ============================================================================
// STATE
// ============================================================================

let logsDir: string | null = null;
const logBuffer: LogEntry[] = [];

export function sanitizeForLogging(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  const sensitiveKeys = [
    "apiKey",
    "api_key",
    "apikey",
    "password",
    "passwd",
    "pwd",
    "secret",
    "token",
    "auth",
    "authorization",
    "credential",
    "private_key",
    "privateKey",
  ];

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.toLowerCase() === "tokens") {
      sanitized[key] = nestedValue;
      continue;
    }

    const isSensitive = sensitiveKeys.some((candidate) =>
      key.toLowerCase().includes(candidate),
    );
    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    sanitized[key] = sanitizeForLogging(nestedValue);
  }

  return sanitized;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the logging system with a directory for log files
 */
export function initializeLogger(directory: string): void {
  logsDir = directory;
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function getDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function writeLogToFile(entry: LogEntry): void {
  if (!logsDir) return;

  const logFile = path.join(logsDir, `${getDateString()}.log`);
  const line = JSON.stringify(entry) + "\n";

  try {
    fs.appendFileSync(logFile, line);
  } catch (error) {
    // Silently fail file writes to avoid infinite loops
    console.error("Failed to write log to file:", error);
  }
}

function formatLogData(data: unknown): string {
  if (data === undefined) return "";

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

// ============================================================================
// LOG ENTRY CREATION
// ============================================================================

function createLogEntry(
  level: LogLevel,
  context: string,
  message: string,
  data?: unknown,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    data: sanitizeForLogging(data),
  };
}

function processLogEntry(entry: LogEntry): void {
  // Add to in-memory buffer
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.shift();
  }

  // Write to file
  writeLogToFile(entry);

  // Console output with colors
  const color = LOG_COLORS[entry.level];
  const timeStr = entry.timestamp.split("T")[1].slice(0, 8);
  const dataStr = formatLogData(entry.data);

  console.log(
    `${color}[${timeStr}] [${entry.level.toUpperCase()}] [${entry.context}]${RESET} ${entry.message}`,
    dataStr ? dataStr : "",
  );
}

// ============================================================================
// LOGGER FACTORY
// ============================================================================

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string): Logger {
  const log = (level: LogLevel, message: string, data?: unknown): void => {
    const entry = createLogEntry(level, context, message, data);
    processLogEntry(entry);
  };

  return {
    debug: (message: string, data?: unknown) => log("debug", message, data),
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
  };
}

// ============================================================================
// LOG BUFFER ACCESS
// ============================================================================

/**
 * Get recent log entries from the in-memory buffer
 */
export function getRecentLogs(limit: number = 100): LogEntry[] {
  return logBuffer.slice(-limit);
}

/**
 * Get log entries for a specific date from file
 */
export function getLogsForDate(date: string): LogEntry[] {
  if (!logsDir) return [];

  const logFile = path.join(logsDir, `${date}.log`);

  if (!fs.existsSync(logFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logFile, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as LogEntry);
  } catch (error) {
    console.error("Failed to read log file:", error);
    return [];
  }
}

/**
 * Clear the in-memory log buffer
 */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
}
