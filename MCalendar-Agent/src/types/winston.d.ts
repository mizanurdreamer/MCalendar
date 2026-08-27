declare module 'winston' {
  export interface Logger {
    info(message: string, meta?: any): Logger;
    error(message: string, meta?: any): Logger;
    warn(message: string, meta?: any): Logger;
    debug(message: string, meta?: any): Logger;
    verbose(message: string, meta?: any): Logger;
    log(level: string, message: string, meta?: any): Logger;
    add(transport: TransportInstance): Logger;
  }
  
  export interface TransportInstance {
    log(info: any, callback: () => void): void;
  }
  
  export interface LoggerOptions {
    level?: string;
    levels?: Record<string, number>;
    transports?: TransportInstance[];
    format?: any;
    defaultMeta?: any;
  }
  
  export function createLogger(options: LoggerOptions): Logger;
  export const format: {
    combine(...formats: any[]): any;
    timestamp(options?: { format?: string }): any;
    printf(format: (info: any) => string): any;
    colorize(): any;
    simple(): any;
    json(): any;
  };
  export const transports: {
    Console: new (options?: { level?: string; handleExceptions?: boolean; format?: any }) => TransportInstance;
    File: new (options: { filename: string; level?: string; maxsize?: number; maxFiles?: number; format?: any }) => TransportInstance;
  };
}