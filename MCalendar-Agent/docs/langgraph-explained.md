# How LangGraph Works

LangGraph is a framework for building **stateful, multi-actor agent workflows** using a graph-based execution model. Here's how it works:

---

## Core Concepts

### 1. **StateGraph** - The Workflow Definition
```
StateGraph → Nodes (agents/functions) → Edges (routing) → Compiled Graph
```

- **Nodes**: Individual units of work (agents, tools, functions)
- **Edges**: Connections between nodes (sequential, conditional, or parallel)
- **State**: Shared data that flows through the graph

### 2. **State** - The Shared Memory
```typescript
// Example from your project
const AgentStateAnnotation = Annotation.Root({
  mode: Annotation<string>(),
  issue: Annotation<any>(),
  testResult: Annotation<any>(),
  messages: Annotation<any[]>(),
  // ... more fields
});
```

State is the **single source of truth** that:
- Gets passed to every node
- Gets modified by nodes (returns partial updates)
- Gets merged back into the graph state

### 3. **Nodes** - The Workers
```typescript
workflow.addNode("agent", this.agentNode(agentName));
workflow.addNode("supervisor", this.supervisorNode.bind(this));
```

Each node:
- Receives current state
- Returns partial state updates
- Can be sync or async

### 4. **Edges** - The Routing
```typescript
// Sequential edge
workflow.addEdge("agent", "supervisor");

// Conditional edge
workflow.addConditionalEdges("supervisor", (state) => {
  if (state.status === "completed") return END;
  return state.currentAgent;
}, {
  "agent1": "agent1",
  "agent2": "agent2",
  [END]: END,
});
```

---

## Execution Flow

```
START → Supervisor → Agent1 → Supervisor → Agent2 → Supervisor → END
         ↑              ↓
         └──────────────┘
```

1. **Graph starts** with initial state
2. **Supervisor node** decides which agent runs next
3. **Agent node** executes and returns state changes
4. **State gets merged** back into graph
5. **Loop continues** until END or failure

---

## How MCalendar Agent Uses LangGraph

### Graph Structure
```
START → Supervisor → IssueAnalyzer → Supervisor → TestsGenerator → Supervisor → RunTests → Supervisor
                      ↑                                                              ↓
                      └──────────────────────────────────────────────────────────────┘
                                              ↓
                                        TestsReviewer → Supervisor → TestsReportGenerator → Supervisor → Summarize → END
```

### Key Implementation (`graph.ts`)

```typescript
// 1. Build the graph
private buildGraph() {
  const workflow = new StateGraph(AgentStateAnnotation);
  
  // Add nodes
  workflow.addNode(GRAPH_NODE.SUPERVISOR, this.supervisorNode.bind(this));
  workflow.addNode(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.agentNode(AGENT_NAMES.AGENT_ISSUE_ANALYZER));
  // ... more agents
  
  // Entry point
  workflow.addEdge(START, GRAPH_NODE.SUPERVISOR);
  
  // Conditional routing from supervisor
  workflow.addConditionalEdges(GRAPH_NODE.SUPERVISOR, (state) => {
    return state.currentAgent;  // Route to current agent
  }, {
    [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: AGENT_NAMES.AGENT_ISSUE_ANALYZER,
    [AGENT_NAMES.AGENT_TESTS_GENERATOR]: AGENT_NAMES.AGENT_TESTS_GENERATOR,
    // ... more routes
  });
  
  // All agents return to supervisor
  for (const agentName of agentNames) {
    workflow.addEdge(agentName, GRAPH_NODE.SUPERVISOR);
  }
  
  return workflow.compile();
}

// 2. Supervisor decides routing
private async supervisorNode(state: AgentState): Promise<Partial<AgentState>> {
  const decision = await this.supervisor.route();
  
  // Handle different actions
  switch (decision.action) {
    case ROUTING_ACTION.ROUTE:
      return { currentAgent: decision.nextAgent };
    case ROUTING_ACTION.COMPLETE:
      return { status: PIPELINE_STATUS.COMPLETED, currentAgent: END };
    case ROUTING_ACTION.FAIL:
      return { status: PIPELINE_STATUS.FAILED, error: decision.reason };
    case ROUTING_ACTION.REPLAN:
      return this.handleReplan(state, decision);
  }
}

// 3. Agent executes and returns state changes
private agentNode(agentName: AgentName) {
  return async (state: AgentState) => {
    const agent = this.agents.get(agentName)!;
    const stateCopy = this.safeStateCopy(state);
    
    agent.setState(stateCopy);
    const newState = await agent.run(stateCopy);
    
    // Extract only changed fields
    const changes = this.extractStateChanges(state, newState);
    return { ...changes, currentAgent: GRAPH_NODE.SUPERVISOR };
  };
}
```

---

## State Management Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph State                          │
├─────────────────────────────────────────────────────────────┤
│  issueAnalysis: { ... }    ← Written by IssueAnalyzer       │
│  testContent: "..."        ← Written by TestsGenerator      │
│  testResult: { ... }       ← Written by RunTests            │
│  summary: "..."            ← Written by Summarize           │
│  currentAgent: "..."       ← Updated by Supervisor          │
│  status: "running"         ← Updated by various nodes       │
└─────────────────────────────────────────────────────────────┘
```

**Key pattern**: Nodes return **partial state updates**, not full state:
```typescript
// Agent returns only what it changed
return { 
  testContent: "new test code",
  testFilename: "issue-123.spec.ts",
  currentAgent: "supervisor"  // Route back to supervisor
};
```

---

## Checkpointing (Persistence)

LangGraph supports checkpointing to save/restore graph state:

```typescript
// From graph.ts
return workflow.compile({
  checkpointer: this.config.checkpointer,  // MemorySaver or custom
  recursionLimit: 100,
});

// Invoke with thread_id for persistence
await graph.invoke(initialState, { 
  configurable: { thread_id: runId } 
});
```

This allows:
- Resuming interrupted workflows
- Human-in-the-loop (pause at approval nodes)
- Debugging with state inspection

---

## Parallel Execution

LangGraph supports parallel execution via `Send()`:

```typescript
// From graph.ts (imported but not fully utilized)
import { Send } from "@langchain/langgraph";

// Parallel routing
case ROUTING_ACTION.PARALLEL:
  return decision.agents.map(agent => 
    new Send(agent, { ...state })
  );
```

---

## Human-in-the-Loop

LangGraph's `interrupt()` function pauses execution:

```typescript
// From graph.ts
private async humanApprovalNode(state: AgentState) {
  // Pause and wait for human input
  const result = interrupt({
    approval_request: state.humanApprovals.find(a => !a.resolved),
  });
  
  // Resume after approval
  return { status: PIPELINE_STATUS.RUNNING };
}
```

---

## Benefits of LangGraph

| Feature | Benefit |
|---------|---------|
| **State management** | Automatic state merging and diffing |
| **Conditional routing** | Dynamic agent selection based on state |
| **Checkpointing** | Resume from any point |
| **Human-in-the-loop** | Built-in pause/resume for approvals |
| **Time travel** | Debug by inspecting state at any step |
| **Streaming** | Real-time updates as graph executes |

---

## MCalendar Agent LangGraph Usage

```
┌──────────────────────────────────────────────────────────────┐
│                    MCalendar Agent Graph                     │
├──────────────────────────────────────────────────────────────┤
│  Nodes: Supervisor, IssueAnalyzer, TestsGenerator,          │
│         RunTests, TestsReviewer, TestsReportGenerator,      │
│         Summarize, Critic, HumanApproval                    │
│                                                              │
│  Edges: Supervisor → Agent → Supervisor (loop)              │
│         Conditional routing based on state                  │
│                                                              │
│  State: Issue analysis, test content, results, summary      │
│                                                              │
│  Features: Checkpointing, parallel execution, replanning    │
└──────────────────────────────────────────────────────────────┘
```

The graph orchestrates the entire test generation pipeline, with the Supervisor making routing decisions and agents executing their specific tasks while sharing state through the graph.
