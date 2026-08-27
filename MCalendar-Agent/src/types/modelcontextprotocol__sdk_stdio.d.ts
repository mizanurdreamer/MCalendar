declare module '@modelcontextprotocol/sdk/client/stdio.js' {
  export interface StdioClientTransportOptions {
    command: string;
    args: string[];
  }
  
  export class StdioClientTransport {
    constructor(options: { command: string; args: string[] });
  }
}