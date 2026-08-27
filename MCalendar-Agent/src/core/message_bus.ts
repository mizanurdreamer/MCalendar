import type { AgentMessage, AgentName } from "./state.js";
import { logger } from "../utils/logger.js";

type MessageHandler = (message: AgentMessage) => Promise<void> | void;

export class MessageBus {
  private subscribers: Map<AgentName, Set<MessageHandler>> = new Map();
  private broadcastSubscribers: Set<MessageHandler> = new Set();
  private messageHistory: AgentMessage[] = [];
  private maxHistory = 1000;

  subscribe(agent: AgentName, handler: MessageHandler): () => void {
    if (!this.subscribers.has(agent)) {
      this.subscribers.set(agent, new Set());
    }
    this.subscribers.get(agent)!.add(handler);
    
    return () => {
      this.subscribers.get(agent)?.delete(handler);
    };
  }

  subscribeToBroadcast(handler: MessageHandler): () => void {
    this.broadcastSubscribers.add(handler);
    return () => {
      this.broadcastSubscribers.delete(handler);
    };
  }

  async publish(message: AgentMessage): Promise<void> {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    logger.debug(`[MessageBus] ${message.from} -> ${message.to}: ${message.type}`);

    if (message.to === "broadcast") {
      await Promise.all(
        Array.from(this.broadcastSubscribers).map(h => h(message))
      );
    } else {
      const handlers = this.subscribers.get(message.to);
      if (handlers) {
        await Promise.all(
          Array.from(handlers).map(h => h(message))
        );
      }
    }
  }

  getHistory(agent?: AgentName, limit = 100): AgentMessage[] {
    let messages = this.messageHistory;
    if (agent) {
      messages = messages.filter(m => m.from === agent || m.to === agent || m.to === "broadcast");
    }
    return messages.slice(-limit);
  }

  clearHistory(): void {
    this.messageHistory = [];
  }
}