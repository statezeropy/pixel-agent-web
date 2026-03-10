import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../api/types.js'

interface AgentChatPanelProps {
  agentId: number
  agents: number[]
  chatMessages: ChatMessage[]
  streamingText: string
  onSendMessage: (message: string) => void
  onSelectAgent: (id: number) => void
  onClose: () => void
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: 360,
  background: 'var(--pixel-bg, #1e1e2e)',
  borderLeft: '2px solid var(--pixel-border, #444)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 150,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--pixel-border, #444)',
  fontSize: '14px',
  color: 'var(--pixel-text, #eee)',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  overflowX: 'auto',
  borderBottom: '1px solid var(--pixel-border, #444)',
  gap: 0,
}

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const inputAreaStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '8px 12px',
  borderTop: '1px solid var(--pixel-border, #444)',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  fontSize: '13px',
  background: 'var(--pixel-btn-bg, #2a2a3e)',
  color: 'var(--pixel-text, #eee)',
  border: '1px solid var(--pixel-border, #444)',
  borderRadius: 0,
  fontFamily: 'inherit',
}

const sendBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '13px',
  background: 'var(--pixel-accent, #6a5acd)',
  color: '#fff',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        padding: '6px 10px',
        fontSize: '13px',
        lineHeight: 1.4,
        background: isUser ? 'var(--pixel-accent, #6a5acd)' : 'var(--pixel-btn-bg, #2a2a3e)',
        color: isUser ? '#fff' : 'var(--pixel-text, #eee)',
        borderRadius: 0,
        border: isUser ? 'none' : '1px solid var(--pixel-border, #444)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {msg.content}
    </div>
  )
}

export function AgentChatPanel({
  agentId,
  agents,
  chatMessages,
  streamingText,
  onSendMessage,
  onSelectAgent,
  onClose,
}: AgentChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingText])

  useEffect(() => {
    inputRef.current?.focus()
  }, [agentId])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Chat</span>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-text-dim, #aaa)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0 4px',
          }}
          onClick={onClose}
          title="Close chat"
        >
          x
        </button>
      </div>

      {/* Agent tabs */}
      {agents.length > 1 && (
        <div style={tabBarStyle}>
          {agents.map((id) => (
            <button
              key={id}
              onClick={() => onSelectAgent(id)}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                background: id === agentId ? 'var(--pixel-active-bg, #333)' : 'transparent',
                color: id === agentId ? 'var(--pixel-text, #eee)' : 'var(--pixel-text-dim, #aaa)',
                border: 'none',
                borderBottom: id === agentId ? '2px solid var(--pixel-accent, #6a5acd)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Agent #{id}
            </button>
          ))}
        </div>
      )}

      <div style={messagesStyle}>
        {chatMessages.length === 0 && !streamingText && (
          <div style={{ textAlign: 'center', color: 'var(--pixel-text-dim, #aaa)', fontSize: '13px', marginTop: 16 }}>
            Send a message to Agent #{agentId}
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {streamingText && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              padding: '6px 10px',
              fontSize: '13px',
              lineHeight: 1.4,
              background: 'var(--pixel-btn-bg, #2a2a3e)',
              color: 'var(--pixel-text, #eee)',
              border: '1px solid var(--pixel-border, #444)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              opacity: 0.8,
            }}
          >
            {streamingText}
            <span className="pixel-agents-pulse">|</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={inputAreaStyle}>
        <input
          ref={inputRef}
          style={inputStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <button style={sendBtnStyle} onClick={handleSubmit}>
          Send
        </button>
      </div>
    </div>
  )
}
