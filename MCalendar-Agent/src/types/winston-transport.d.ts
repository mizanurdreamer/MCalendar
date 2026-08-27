declare module 'winston-transport' {
  import { TransportInstance } from 'winston';
  
  export default class Transport {
    constructor(opts?: any);
    log(info: any, callback: () => void): void;
  }
}