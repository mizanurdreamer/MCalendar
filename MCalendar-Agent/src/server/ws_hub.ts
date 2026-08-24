import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

type WsEvent = { type: string; [key: string]: unknown };

const clients = new Set<WebSocket>();
let wss: WebSocketServer | null = null;

export function attachWs(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: "connected" } satisfies WsEvent));

    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsEvent;
        if (msg.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
      } catch {
        // ignore malformed frames
      }
    });
  });
}

export function broadcast(event: WsEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function connectedCount(): number {
  return clients.size;
}
