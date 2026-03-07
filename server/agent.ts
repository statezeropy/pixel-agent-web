import { BaseCallbackHandler } from "@langchain/core/callbacks";
import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { Server } from "socket.io";

export class AgentCallbackHandler extends BaseCallbackHandler {
  name = "AgentCallbackHandler";
  private io: Server;
  private agentId: number;

  constructor(io: Server, agentId: number) {
    super();
    this.io = io;
    this.agentId = agentId;
  }

  async handleAgentAction(action: AgentAction) {
    const toolId = action.tool; // For now, use tool name as toolId if no unique ID
    const status = `Using ${action.tool}`;
    console.log(`[Agent ${this.agentId}] Tool Start: ${action.tool}`);
    
    this.io.emit("message", {
      type: "agentToolStart",
      id: this.agentId,
      toolId: action.tool + "_" + Date.now(), // Generate a unique toolId
      status,
    });
    
    this.io.emit("message", {
      type: "agentStatus",
      id: this.agentId,
      status: "active",
    });
  }

  async handleAgentEnd(finish: AgentFinish) {
    console.log(`[Agent ${this.agentId}] Agent End`);
    this.io.emit("message", {
      type: "agentStatus",
      id: this.agentId,
      status: "waiting",
    });
  }

  async handleToolStart(tool: any, input: string) {
    // handled by handleAgentAction for now
  }

  async handleToolEnd(output: string) {
    this.io.emit("message", {
      type: "agentToolDone",
      id: this.agentId,
      toolId: "current", // This is a bit tricky with standard agent executor
    });
  }
}
