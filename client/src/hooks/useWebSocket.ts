import { useState, useEffect, useRef, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout, ToolActivity } from '../office/types.js'
import { extractToolName } from '../office/toolUtils.js'
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js'
import { playDoneSound, setSoundEnabled } from '../notificationSound.js'
import { wsManager } from '../api/websocket.js'
import type { ServerMessage, ExistingAgent, ChatMessage } from '../api/types.js'

export interface SubagentCharacter {
  id: number
  parentAgentId: number
  parentToolId: string
  label: string
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
}

export interface WebSocketState {
  agents: number[]
  selectedAgent: number | null
  selectAgent: (id: number | null) => void
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  /** Tracks which agents are in LLM generation phase (thinking/typing response) */
  agentLlmPhase: Record<number, boolean>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  chatMessages: Record<number, ChatMessage[]>
  streamingText: Record<number, string>
  isConnected: boolean
  layoutReady: boolean
  sendMessage: (agentId: number, message: string) => void
  createAgent: (provider: string, model: string, systemPrompt?: string) => void
  closeAgent: (agentId: number) => void
  resumeInterrupt: (agentId: number, value: 'approve' | 'deny') => void
  saveLayout: (layout: OfficeLayout) => void
  saveAgentSeats: (seats: Record<number, { palette: number; hueShift: number; seatId: string | null }>) => void
}

const TOOL_END_DELAY_MS = 300
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`

function saveAgentSeatsToServer(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {}
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId }
  }
  wsManager.send({ type: 'save_agent_seats', seats })
}

export function useWebSocket(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): WebSocketState {
  const [agents, setAgents] = useState<number[]>([])
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null)
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({})
  const [agentLlmPhase, setAgentLlmPhase] = useState<Record<number, boolean>>({})
  const [subagentTools, setSubagentTools] = useState<Record<number, Record<string, ToolActivity[]>>>({})
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([])
  const [chatMessages, setChatMessages] = useState<Record<number, ChatMessage[]>>({})
  const [streamingText, setStreamingText] = useState<Record<number, string>>({})
  const [isConnected, setIsConnected] = useState(false)
  const [layoutReady, setLayoutReady] = useState(false)

  const layoutReadyRef = useRef(false)
  const pendingAgentsRef = useRef<ExistingAgent[]>([])

  // Set up WebSocket connection
  const mountIdRef = useRef(0)
  useEffect(() => {
    const sessionId = crypto.randomUUID()
    const mountId = ++mountIdRef.current

    // Fallback: if WS doesn't deliver layout within 5s, use default layout
    const layoutFallbackTimer = setTimeout(() => {
      if (mountId !== mountIdRef.current) return
      if (!layoutReadyRef.current) {
        console.warn('[WS] Layout not received in time — using default layout')
        const os = getOfficeState()
        onLayoutLoaded?.(os.getLayout())
        layoutReadyRef.current = true
        setLayoutReady(true)
      }
    }, 5000)

    const unsubConnect = wsManager.onConnect(() => {
      if (mountId !== mountIdRef.current) return
      setIsConnected(true)
      wsManager.send({ type: 'client_ready' })
    })

    const unsubDisconnect = wsManager.onDisconnect(() => {
      if (mountId !== mountIdRef.current) return
      setIsConnected(false)
    })

    const unsubMessage = wsManager.onMessage((msg: ServerMessage) => {
      if (mountId !== mountIdRef.current) return
      const os = getOfficeState()

      switch (msg.type) {
        case 'layout_loaded': {
          if (layoutReadyRef.current && isEditDirty?.()) {
            console.log('[WS] Skipping external layout update — editor has unsaved changes')
            return
          }
          const rawLayout = msg.layout as OfficeLayout | null
          const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
          if (layout) {
            os.rebuildFromLayout(layout)
            onLayoutLoaded?.(layout)
          } else {
            onLayoutLoaded?.(os.getLayout())
          }
          // Add buffered agents
          for (const p of pendingAgentsRef.current) {
            os.addAgent(p.id, p.palette, p.hue_shift, p.seat_id, true)
          }
          pendingAgentsRef.current = []
          layoutReadyRef.current = true
          setLayoutReady(true)
          if (os.characters.size > 0) {
            saveAgentSeatsToServer(os)
          }
          break
        }

        case 'settings_loaded': {
          setSoundEnabled(msg.sound_enabled)
          break
        }

        case 'existing_agents': {
          const incoming = msg.agents
          if (!layoutReadyRef.current) {
            pendingAgentsRef.current.push(...incoming)
          } else {
            for (const a of incoming) {
              os.addAgent(a.id, a.palette, a.hue_shift, a.seat_id, true)
            }
          }
          setAgents((prev) => {
            const ids = new Set(prev)
            const merged = [...prev]
            for (const a of incoming) {
              if (!ids.has(a.id)) {
                merged.push(a.id)
              }
            }
            return merged.sort((a, b) => a - b)
          })
          break
        }

        case 'agent_created': {
          const id = msg.agent_id
          setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
          setSelectedAgent(id)
          os.addAgent(id)
          saveAgentSeatsToServer(os)
          break
        }

        case 'agent_closed': {
          const id = msg.agent_id
          setAgents((prev) => prev.filter((a) => a !== id))
          setSelectedAgent((prev) => (prev === id ? null : prev))
          setAgentTools((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setAgentStatuses((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setAgentLlmPhase((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setSubagentTools((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setChatMessages((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setStreamingText((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          os.removeAllSubagents(id)
          setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
          os.removeAgent(id)
          break
        }

        case 'agent_status': {
          const id = msg.agent_id
          const status = msg.status
          setAgentStatuses((prev) => {
            if (status === 'active') {
              if (!(id in prev)) return prev
              const next = { ...prev }
              delete next[id]
              return next
            }
            return { ...prev, [id]: status }
          })
          // Clear LLM phase on any terminal status
          if (status === 'waiting' || status === 'error') {
            setAgentLlmPhase((prev) => {
              if (!(id in prev)) return prev
              const next = { ...prev }
              delete next[id]
              return next
            })
          }
          os.setAgentActive(id, status === 'active')
          if (status === 'waiting') {
            os.showWaitingBubble(id)
            playDoneSound()
            // Flush streaming text to chat messages
            setStreamingText((prev) => {
              const text = prev[id]
              if (text) {
                setChatMessages((cm) => ({
                  ...cm,
                  [id]: [...(cm[id] || []), { role: 'assistant', content: text, timestamp: Date.now() }],
                }))
                const next = { ...prev }
                delete next[id]
                return next
              }
              return prev
            })
          }
          if (status === 'error') {
            // Flush any partial streaming text as error context
            setStreamingText((prev) => {
              const text = prev[id]
              if (text) {
                setChatMessages((cm) => ({
                  ...cm,
                  [id]: [...(cm[id] || []), { role: 'assistant', content: text, timestamp: Date.now() }],
                }))
                const next = { ...prev }
                delete next[id]
                return next
              }
              return prev
            })
            // Add error message to chat
            const errorText = (msg as { error?: string }).error
            if (errorText) {
              setChatMessages((cm) => ({
                ...cm,
                [id]: [...(cm[id] || []), { role: 'assistant', content: `Error: ${errorText}`, timestamp: Date.now() }],
              }))
            }
          }
          break
        }

        case 'llm_start': {
          const id = msg.agent_id
          setAgentLlmPhase((prev) => ({ ...prev, [id]: true }))
          os.setAgentActive(id, true)
          // Set tool to null so character shows typing animation (not tool-specific)
          os.setAgentTool(id, null)
          break
        }

        case 'tool_start': {
          const id = msg.agent_id
          const toolId = msg.tool_id
          const status = msg.status
          // Clear LLM phase — agent is now using tools
          setAgentLlmPhase((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setAgentTools((prev) => {
            const list = prev[id] || []
            if (list.some((t) => t.toolId === toolId)) return prev
            return { ...prev, [id]: [...list, { toolId, status, done: false }] }
          })
          const toolName = extractToolName(status)
          os.setAgentTool(id, toolName)
          os.setAgentActive(id, true)
          os.clearPermissionBubble(id)
          // Create sub-agent character for Task tool subtasks
          if (status.startsWith('Subtask:')) {
            const label = status.slice('Subtask:'.length).trim()
            const subId = os.addSubagent(id, toolId)
            setSubagentCharacters((prev) => {
              if (prev.some((s) => s.id === subId)) return prev
              return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }]
            })
          }
          break
        }

        case 'tool_end': {
          const id = msg.agent_id
          const toolId = msg.tool_id
          setTimeout(() => {
            setAgentTools((prev) => {
              const list = prev[id]
              if (!list) return prev
              return {
                ...prev,
                [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
              }
            })
          }, TOOL_END_DELAY_MS)
          break
        }

        case 'tools_clear': {
          const id = msg.agent_id
          setAgentTools((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          setSubagentTools((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          os.removeAllSubagents(id)
          setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
          os.setAgentTool(id, null)
          os.clearPermissionBubble(id)
          break
        }

        case 'interrupt': {
          const id = msg.agent_id
          setAgentTools((prev) => {
            const list = prev[id]
            if (!list) return prev
            return {
              ...prev,
              [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
            }
          })
          os.showPermissionBubble(id)
          break
        }

        case 'interrupt_clear': {
          const id = msg.agent_id
          setAgentTools((prev) => {
            const list = prev[id]
            if (!list) return prev
            const hasPermission = list.some((t) => t.permissionWait)
            if (!hasPermission) return prev
            return {
              ...prev,
              [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
            }
          })
          os.clearPermissionBubble(id)
          for (const [subId, meta] of os.subagentMeta) {
            if (meta.parentAgentId === id) {
              os.clearPermissionBubble(subId)
            }
          }
          break
        }

        case 'subagent_tool_start': {
          const id = msg.agent_id
          const parentToolId = msg.parent_tool_id
          const toolId = msg.tool_id
          const status = msg.status
          setSubagentTools((prev) => {
            const agentSubs = prev[id] || {}
            const list = agentSubs[parentToolId] || []
            if (list.some((t) => t.toolId === toolId)) return prev
            return { ...prev, [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] } }
          })
          const subId = os.getSubagentId(id, parentToolId)
          if (subId !== null) {
            const subToolName = extractToolName(status)
            os.setAgentTool(subId, subToolName)
            os.setAgentActive(subId, true)
          }
          break
        }

        case 'subagent_tool_end': {
          const id = msg.agent_id
          const parentToolId = msg.parent_tool_id
          const toolId = msg.tool_id
          setSubagentTools((prev) => {
            const agentSubs = prev[id]
            if (!agentSubs) return prev
            const list = agentSubs[parentToolId]
            if (!list) return prev
            return {
              ...prev,
              [id]: { ...agentSubs, [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)) },
            }
          })
          break
        }

        case 'subagent_clear': {
          const id = msg.agent_id
          const parentToolId = msg.parent_tool_id
          setSubagentTools((prev) => {
            const agentSubs = prev[id]
            if (!agentSubs || !(parentToolId in agentSubs)) return prev
            const next = { ...agentSubs }
            delete next[parentToolId]
            if (Object.keys(next).length === 0) {
              const outer = { ...prev }
              delete outer[id]
              return outer
            }
            return { ...prev, [id]: next }
          })
          os.removeSubagent(id, parentToolId)
          setSubagentCharacters((prev) => prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)))
          break
        }

        case 'subagent_interrupt': {
          const id = msg.agent_id
          const parentToolId = msg.parent_tool_id
          const subId = os.getSubagentId(id, parentToolId)
          if (subId !== null) {
            os.showPermissionBubble(subId)
          }
          break
        }

        case 'llm_token': {
          const id = msg.agent_id
          setStreamingText((prev) => ({
            ...prev,
            [id]: (prev[id] || '') + msg.content,
          }))
          // Ensure character is active and typing during token generation
          os.setAgentActive(id, true)
          os.setAgentTool(id, null) // null tool = typing animation
          break
        }

        case 'llm_end': {
          const id = msg.agent_id
          setStreamingText((prev) => {
            const text = prev[id]
            if (text) {
              setChatMessages((cm) => ({
                ...cm,
                [id]: [...(cm[id] || []), { role: 'assistant', content: text, timestamp: Date.now() }],
              }))
              const next = { ...prev }
              delete next[id]
              return next
            }
            return prev
          })
          break
        }

        case 'pong':
          break
      }
    })

    wsManager.connect(`${WS_URL}/${sessionId}`)

    return () => {
      clearTimeout(layoutFallbackTimer)
      unsubConnect()
      unsubDisconnect()
      unsubMessage()
      // Don't disconnect the singleton wsManager here — the next mount's
      // connect() call will clean up the previous connection automatically.
      // Disconnecting here races with StrictMode's remount and kills the
      // second connection.
    }
  }, [getOfficeState, onLayoutLoaded, isEditDirty])

  const sendMessage = useCallback((agentId: number, message: string) => {
    setChatMessages((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), { role: 'user', content: message, timestamp: Date.now() }],
    }))
    wsManager.send({ type: 'send_message', agent_id: agentId, message })
  }, [])

  const createAgent = useCallback((provider: string, model: string, systemPrompt?: string) => {
    wsManager.send({ type: 'create_agent', provider, model, system_prompt: systemPrompt })
  }, [])

  const closeAgent = useCallback((agentId: number) => {
    wsManager.send({ type: 'close_agent', agent_id: agentId })
  }, [])

  const resumeInterrupt = useCallback((agentId: number, value: 'approve' | 'deny') => {
    wsManager.send({ type: 'resume', agent_id: agentId, value })
  }, [])

  const saveLayout = useCallback((layout: OfficeLayout) => {
    wsManager.send({ type: 'save_layout', layout })
  }, [])

  const saveAgentSeats = useCallback((seats: Record<number, { palette: number; hueShift: number; seatId: string | null }>) => {
    wsManager.send({ type: 'save_agent_seats', seats })
  }, [])

  const selectAgent = useCallback((id: number | null) => {
    setSelectedAgent(id)
  }, [])

  return {
    agents,
    selectedAgent,
    selectAgent,
    agentTools,
    agentStatuses,
    agentLlmPhase,
    subagentTools,
    subagentCharacters,
    chatMessages,
    streamingText,
    isConnected,
    layoutReady,
    sendMessage,
    createAgent,
    closeAgent,
    resumeInterrupt,
    saveLayout,
    saveAgentSeats,
  }
}
