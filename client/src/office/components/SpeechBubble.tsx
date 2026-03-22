import { useState, useEffect, useRef } from 'react'
import type { OfficeState } from '../engine/officeState.js'
import type { ToolActivity } from '../types.js'
import { TILE_SIZE, CharacterState } from '../types.js'
import { CHARACTER_SITTING_OFFSET_PX } from '../../constants.js'
import type { ChatMessage } from '../../api/types.js'

/** Max characters shown in the speech bubble */
const MAX_BUBBLE_TEXT = 80
/** How long (ms) to show last response after completion */
const DONE_DISPLAY_MS = 5000

interface SpeechBubbleProps {
  officeState: OfficeState
  agents: number[]
  agentStatuses: Record<number, string>
  agentLlmPhase: Record<number, boolean>
  streamingText: Record<number, string>
  agentTools: Record<number, ToolActivity[]>
  chatMessages: Record<number, ChatMessage[]>
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
}

/** Get the last line or last N characters of text */
function truncateEnd(text: string, max: number): string {
  // Take last meaningful line
  const lines = text.trim().split('\n')
  const lastLine = lines[lines.length - 1].trim()
  if (lastLine.length <= max) return lastLine
  return '...' + lastLine.slice(-(max - 3))
}

/** Determine what text to show in the speech bubble, or null to hide */
function getBubbleContent(
  agentId: number,
  agentStatuses: Record<number, string>,
  agentLlmPhase: Record<number, boolean>,
  streamingText: Record<number, string>,
  agentTools: Record<number, ToolActivity[]>,
  chatMessages: Record<number, ChatMessage[]>,
  isActive: boolean,
  doneText: string | null,
): { text: string; variant: 'thinking' | 'streaming' | 'done' | 'error' | 'tool' } | null {
  const status = agentStatuses[agentId]

  // Error state
  if (status === 'error') {
    const msgs = chatMessages[agentId]
    const lastMsg = msgs?.[msgs.length - 1]
    if (lastMsg && lastMsg.content.startsWith('Error:')) {
      return { text: truncateEnd(lastMsg.content.slice(7), MAX_BUBBLE_TEXT), variant: 'error' }
    }
    return { text: 'Error occurred', variant: 'error' }
  }

  // Streaming LLM text — show what's being typed
  const streaming = streamingText[agentId]
  if (streaming) {
    return { text: truncateEnd(streaming, MAX_BUBBLE_TEXT), variant: 'streaming' }
  }

  // Thinking — LLM started but no tokens yet
  if (isActive && agentLlmPhase[agentId]) {
    return { text: '...', variant: 'thinking' }
  }

  // Active with tools — show tool status
  if (isActive) {
    const tools = agentTools[agentId]
    if (tools && tools.length > 0) {
      const activeTool = [...tools].reverse().find((t) => !t.done)
      if (activeTool) {
        if (activeTool.permissionWait) return { text: 'Needs approval', variant: 'tool' }
        // Extract just the tool verb (first word)
        const verb = activeTool.status.split(/[\s:]/)[0]
        return { text: verb + '...', variant: 'tool' }
      }
    }
  }

  // Just finished — show last response briefly
  if (doneText) {
    return { text: truncateEnd(doneText, MAX_BUBBLE_TEXT), variant: 'done' }
  }

  return null
}

export function SpeechBubble({
  officeState,
  agents,
  agentStatuses,
  agentLlmPhase,
  streamingText,
  agentTools,
  chatMessages,
  containerRef,
  zoom,
  panRef,
}: SpeechBubbleProps) {
  const [, setTick] = useState(0)
  // Track "done" text per agent — shown briefly after completion
  const doneTexts = useRef<Record<number, { text: string; expiry: number }>>({})
  const prevStatuses = useRef<Record<number, string>>({})

  useEffect(() => {
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Detect transitions to 'waiting' → capture last assistant message as done text
  const now = Date.now()
  for (const id of agents) {
    const prev = prevStatuses.current[id]
    const curr = agentStatuses[id]
    if (curr === 'waiting' && prev !== 'waiting') {
      const msgs = chatMessages[id]
      const lastMsg = msgs?.[msgs.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content.startsWith('Error:')) {
        doneTexts.current[id] = { text: lastMsg.content, expiry: now + DONE_DISPLAY_MS }
      }
    }
    prevStatuses.current[id] = curr ?? ''
  }
  // Expire done texts
  for (const idStr of Object.keys(doneTexts.current)) {
    const id = Number(idStr)
    if (doneTexts.current[id].expiry < now) {
      delete doneTexts.current[id]
    }
  }

  const el = containerRef.current
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  return (
    <>
      {agents.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null
        if (ch.matrixEffect) return null // hide during spawn/despawn

        const doneEntry = doneTexts.current[id]
        const content = getBubbleContent(
          id, agentStatuses, agentLlmPhase, streamingText,
          agentTools, chatMessages, ch.isActive,
          doneEntry?.text ?? null,
        )
        if (!content) return null

        // Position above character head
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        // 24px is character sprite height — bubble goes above head
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - 26) * zoom) / dpr

        const variantClass = `speech-bubble--${content.variant}`

        return (
          <div
            key={`bubble-${id}`}
            className={`speech-bubble ${variantClass}`}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 90,
            }}
          >
            <div className="speech-bubble__content">
              {content.text}
            </div>
            <div className="speech-bubble__tail" />
          </div>
        )
      })}
    </>
  )
}
