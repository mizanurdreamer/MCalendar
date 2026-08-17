import chalk from "chalk";

export const logger = {
  info(message: string) {
    console.log(chalk.cyan(`[${timestamp()}]`), message);
  },

  success(message: string) {
    console.log(chalk.green(`[${timestamp()}]`), message);
  },

  warn(message: string) {
    console.log(chalk.yellow(`[${timestamp()}]`), message);
  },

  error(message: string) {
    console.log(chalk.red(`[${timestamp()}]`), message);
  },

  task(taskName: string, provider: string) {
    console.log(chalk.magenta(`[${timestamp()}]`), `🧠 ${taskName} → ${provider}`);
  },

  tool(toolName: string, arg?: string) {
    const detail = arg ? `(${arg})` : "";
    console.log(chalk.gray(`[${timestamp()}]`), `  📖 ${toolName} ${detail}`);
  },

  banner(lines: string[]) {
    const maxLen = Math.max(...lines.map((l) => l.length));
    const border = "═".repeat(maxLen + 4);
    console.log(chalk.cyan(`╔${border}╗`));
    for (const line of lines) {
      console.log(chalk.cyan(`║`), chalk.white(` ${line.padEnd(maxLen)} `), chalk.cyan(`║`));
    }
    console.log(chalk.cyan(`╚${border}╝`));
    console.log();
  },
};

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}
