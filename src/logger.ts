const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function timestamp(): string {
  return new Date().toISOString();
}

function prefix(level: string, color: string): string {
  return `${DIM}[${timestamp()}]${RESET} ${color}${BOLD}[${level}]${RESET}`;
}

export const logger = {
  info(message: string): void {
    console.log(`${prefix("INFO", CYAN)} ${message}`);
  },

  success(message: string): void {
    console.log(`${prefix("MATCH", GREEN)} ${message}`);
  },

  warn(message: string): void {
    console.warn(`${prefix("WARN", YELLOW)} ${message}`);
  },

  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? ` — ${err.message}` : "";
    console.error(`${prefix("ERROR", RED)} ${message}${detail}`);
  },

  section(title: string): void {
    const line = "─".repeat(60);
    console.log(`\n${BOLD}${CYAN}${line}${RESET}`);
    console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
    console.log(`${BOLD}${CYAN}${line}${RESET}\n`);
  },

  summary(label: string, value: string | number): void {
    console.log(`  ${BOLD}${label}:${RESET} ${value}`);
  },
};
