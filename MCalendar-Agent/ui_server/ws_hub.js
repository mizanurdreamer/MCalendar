import { WebSocketServer, WebSocket } from "ws";
const clients = new Set();
let wss = null;
export function attachWs(server) {
    wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (socket) => {
        clients.add(socket);
        socket.send(JSON.stringify({ type: "connected" }));
        socket.on("close", () => clients.delete(socket));
        socket.on("error", () => clients.delete(socket));
        socket.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "ping")
                    socket.send(JSON.stringify({ type: "pong" }));
            }
            catch {
                // ignore malformed frames
            }
        });
    });
}
export function broadcast(event) {
    const payload = JSON.stringify(event);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}
export function connectedCount() {
    return clients.size;
}
//# sourceMappingURL=ws_hub.js.map