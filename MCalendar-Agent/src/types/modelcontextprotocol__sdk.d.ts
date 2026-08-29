declare module '@modelcontextprotocol/sdk/client/index.js' {
  export interface ClientOptions {
    transport: any;
  }
  
  export class Client {
    constructor(options: { transport: any });
    connect(): Promise<void>;
    close(): Promise<void>;
    request(request: any): Promise<any>;
    notify(notification: any): Promise<void>;
    listTools(): Promise<any>;
    callTool(
      params: { name: string; arguments?: any },
      resultSchema?: any,
      options?: { timeout?: number }
    ): Promise<any>;
  }
}

declare module '@modelcontextprotocol/sdk/client/stdio.js' {
  export interface StdioClientTransportOptions {
    command: string;
    args: string[];
  }
  
  export class StdioClientTransport {
    constructor(options: { command: string; args: string[] });
    onerror: ((err: Error) => void) | null;
    onclose: () => void;
  }
}