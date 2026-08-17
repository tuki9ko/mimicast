/**
 * 構造化ログ（JSON）。
 *
 * 設計 19.1 に対応する。
 * Signed URL そのもの、および Signature パラメータをログへ出力してはならない。
 * 記録してよいのは videoId と expiresAt のみ。
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentThreshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[configured as LogLevel] ?? LEVEL_ORDER.info;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < currentThreshold()) return;
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function toErrorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorName: "UnknownError", errorMessage: String(error) };
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
