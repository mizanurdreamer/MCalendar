import winston from "winston";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs";

const LOG_DIR = path.join(process.cwd(), "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}-${h}-${mi}-${s}-${ampm}`;
}
const timestamp = formatTimestamp(new Date());

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message }) => {
    const ts = String(timestamp);
    switch (level) {
      case "info":
        return `${chalk.cyan(`[${ts}]`)} ${message}`;
      case "warn":
        return `${chalk.yellow(`[${ts}]`)} ${message}`;
      case "error":
        return `${chalk.red(`[${ts}]`)} ${message}`;
      default:
        return `${chalk.gray(`[${ts}]`)} ${message}`;
    }
  })
);

const winstonLogger = winston.createLogger({
  level: "debug",
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, `agent-${timestamp}.log`),
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, `error-${timestamp}.log`),
      level: "error",
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, `prompts-${timestamp}.log`),
      format: fileFormat,
    }),
  ],
});

export const logger = {
  info(message: string) {
    winstonLogger.info(message);
  },

  success(message: string) {
    winstonLogger.info(`✅ ${message}`);
  },

  warn(message: string) {
    winstonLogger.warn(message);
  },

  error(message: string) {
    winstonLogger.error(message);
  },

  debug(message: string) {
    winstonLogger.debug(message);
  },

  task(taskName: string, provider: string) {
    winstonLogger.info(`🧠 ${taskName} → ${provider}`);
  },

  tool(toolName: string, arg?: string) {
    const detail = arg ? `(${arg})` : "";
    winstonLogger.debug(`📖 ${toolName} ${detail}`);
  },

  prompt(agentName: string, systemPrompt: string, userMessage: string, response?: string) {
    winstonLogger.info(`[PROMPT] ${agentName}`, {
      agent: agentName,
      systemPrompt,
      userMessage,
      response: response ?? "(pending)",
    });
  },

  banner(lines: string[]) {
    const maxLen = Math.max(...lines.map((l) => l.length));
    const border = "═".repeat(maxLen + 4);
    const box = [
      `╔${border}╗`,
      ...lines.map((l) => `║ ${l.padEnd(maxLen)} ║`),
      `╚${border}╝`,
    ].join("\n");
    winstonLogger.info(`\n${box}\n`);
  },
};
