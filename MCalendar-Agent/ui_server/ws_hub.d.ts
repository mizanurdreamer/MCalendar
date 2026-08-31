import type { Server } from "node:http";
type WsEvent = {
    type: string;
    [key: string]: unknown;
};
export declare function attachWs(server: Server): void;
export declare function broadcast(event: WsEvent): void;
export declare function connectedCount(): number;
export {};
