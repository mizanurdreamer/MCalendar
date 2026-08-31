import Transport from "winston-transport";
import { winstonInstance } from "../src/utils/logger.js";
import { broadcast } from "./ws_hub.js";
const MAX_MESSAGE_LENGTH = 4000;
let attached = false;
class BroadcastTransport extends Transport {
    log(info, callback) {
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
export function attachLogBroadcast() {
    if (attached)
        return;
    winstonInstance.add(new BroadcastTransport());
    attached = true;
}
//# sourceMappingURL=log_transport.js.map