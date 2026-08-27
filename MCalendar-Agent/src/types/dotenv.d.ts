declare module 'dotenv' {
  export function config(options?: { path?: string }): { parsed: Record<string, string> | undefined };
  export function parse(src: string): Record<string, string>;
}