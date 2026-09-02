import Transport from "winston-transport";
import { winstonInstance } from "../src/utils/logger.js";
import { broadcast } from "./ws_hub.js";
import { agentEvents } from "../src/core/agent_events.js";
import type { CoreAgentEvent } from "../src/core/agent_events.js";

const MAX_MESSAGE_LENGTH = 4000;
let attached = false;

class BroadcastTransport extends Transport {
  public log(info: { level?: string; message?: unknown }, callback: () => void): void {
    setImmediate(() => {
      const raw = typeof info.message === "string" ? info.message : String(info.message ?? "");
      if (raw.startsWith("[PROMPT]")) {
        callback();
        return;
      }
      broadcast({
        type: "log",
        level: info.level ?? "info",
        message: raw.length > MAX_MESSAGE_LENGTH ? `${raw.slice(0, MAX_MESSAGE_LENGTH)}…` : raw,
        timestamp: new Date().toISOString(),
      });
      callback();
    });
  }
}

export function attachLogBroadcast(): void {
  if (attached) return;
  winstonInstance.add(new BroadcastTransport());
  
  // Subscribe to core agent events and broadcast via WebSocket
  agentEvents.on("agent:status", (event: CoreAgentEvent) => {
    broadcast(event);
  });
  agentEvents.on("agent:step", (event: CoreAgentEvent) => {
    broadcast(event);
  });
  
  attached = true;
}
