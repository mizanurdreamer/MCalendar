import { EventEmitter } from "node:events";

export interface AgentStatusEvent {
  type: "agent:status";
  agent: string;
  status: string;
  timestamp: string;
}

export interface AgentStepEvent {
  type: "agent:step";
  agent: string;
  step: {
    stepId: string;
    tool: string;
    args: any;
    expectedOutcome: string;
    reasoning: string;
    status: "pending" | "running" | "completed" | "failed";
    startedAt?: number;
    completedAt?: number;
  };
  timestamp: string;
}

export type CoreAgentEvent = AgentStatusEvent | AgentStepEvent;

class AgentEventEmitter extends EventEmitter {
  emitAgentStatus(agent: string, status: string): void {
    this.emit("agent:status", {
      type: "agent:status",
      agent,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  emitAgentStep(agent: string, step: AgentStepEvent["step"]): void {
    this.emit("agent:step", {
      type: "agent:step",
      agent,
      step,
      timestamp: new Date().toISOString(),
    });
  }
}

export const agentEvents = new AgentEventEmitter();
