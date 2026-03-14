import type { OfficeLayout } from '../office/types.js'

// ── Server → Client Messages ──

export interface AgentCreatedMsg {
  type: 'agent_created'
  agent_id: number
  provider: string
  model: string
}

export interface AgentClosedMsg {
  type: 'agent_closed'
  agent_id: number
}

export interface AgentStatusMsg {
  type: 'agent_status'
  agent_id: number
  status: 'active' | 'waiting' | 'error'
  error?: string
}

export interface ToolStartMsg {
  type: 'tool_start'
  agent_id: number
  tool_id: string
  tool_name: string
  status: string
}

export interface ToolEndMsg {
  type: 'tool_end'
  agent_id: number
  tool_id: string
}

export interface ToolsClearMsg {
  type: 'tools_clear'
  agent_id: number
}

export interface SubagentToolStartMsg {
  type: 'subagent_tool_start'
  agent_id: number
  parent_tool_id: string
  tool_id: string
  tool_name: string
  status: string
}

export interface SubagentToolEndMsg {
  type: 'subagent_tool_end'
  agent_id: number
  parent_tool_id: string
  tool_id: string
}

export interface SubagentClearMsg {
  type: 'subagent_clear'
  agent_id: number
  parent_tool_id: string
}

export interface InterruptMsg {
  type: 'interrupt'
  agent_id: number
  tool_id: string
  data: { question: string; tool_name: string; tool_input: unknown }
}

export interface InterruptClearMsg {
  type: 'interrupt_clear'
  agent_id: number
}

export interface SubagentInterruptMsg {
  type: 'subagent_interrupt'
  agent_id: number
  parent_tool_id: string
}

export interface LlmStartMsg {
  type: 'llm_start'
  agent_id: number
}

export interface LlmTokenMsg {
  type: 'llm_token'
  agent_id: number
  content: string
}

export interface LlmEndMsg {
  type: 'llm_end'
  agent_id: number
}

export interface LayoutLoadedMsg {
  type: 'layout_loaded'
  layout: OfficeLayout
}

export interface SettingsLoadedMsg {
  type: 'settings_loaded'
  sound_enabled: boolean
}

export interface ExistingAgent {
  id: number
  palette?: number
  hue_shift?: number
  seat_id?: string
  provider?: string
  model?: string
}

export interface ExistingAgentsMsg {
  type: 'existing_agents'
  agents: ExistingAgent[]
}

export interface PongMsg {
  type: 'pong'
}

export type ServerMessage =
  | AgentCreatedMsg
  | AgentClosedMsg
  | AgentStatusMsg
  | ToolStartMsg
  | ToolEndMsg
  | ToolsClearMsg
  | SubagentToolStartMsg
  | SubagentToolEndMsg
  | SubagentClearMsg
  | InterruptMsg
  | InterruptClearMsg
  | SubagentInterruptMsg
  | LlmStartMsg
  | LlmTokenMsg
  | LlmEndMsg
  | LayoutLoadedMsg
  | SettingsLoadedMsg
  | ExistingAgentsMsg
  | PongMsg

// ── Client → Server Messages ──

export interface CreateAgentMsg {
  type: 'create_agent'
  provider: string
  model: string
  system_prompt?: string
}

export interface CloseAgentMsg {
  type: 'close_agent'
  agent_id: number
}

export interface SendMessageMsg {
  type: 'send_message'
  agent_id: number
  message: string
}

export interface ResumeMsg {
  type: 'resume'
  agent_id: number
  value: 'approve' | 'deny'
}

export interface SaveLayoutMsg {
  type: 'save_layout'
  layout: OfficeLayout
}

export interface SaveAgentSeatsMsg {
  type: 'save_agent_seats'
  seats: Record<number, { palette: number; hueShift: number; seatId: string | null }>
}

export interface SetSoundEnabledMsg {
  type: 'set_sound_enabled'
  enabled: boolean
}

export interface ClientReadyMsg {
  type: 'client_ready'
}

export interface PingMsg {
  type: 'ping'
}

export type ClientMessage =
  | CreateAgentMsg
  | CloseAgentMsg
  | SendMessageMsg
  | ResumeMsg
  | SaveLayoutMsg
  | SaveAgentSeatsMsg
  | SetSoundEnabledMsg
  | ClientReadyMsg
  | PingMsg

// ── Chat types ──

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
}
