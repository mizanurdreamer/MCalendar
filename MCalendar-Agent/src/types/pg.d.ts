declare module "pg" {
  export interface PoolConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, params?: any[]): Promise<any>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export class PoolClient {
    query(text: string, params?: any[]): Promise<any>;
    release(): void;
  }

  export interface PoolClient {
    query(text: string, params?: any[]): Promise<any>;
    release(): void;
  }

  export class Client {
    constructor(config?: PoolConfig);
    connect(): Promise<void>;
    query(text: string, params?: any[]): Promise<any>;
    end(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export const defaults: PoolConfig & { parseInt8?: boolean };
}