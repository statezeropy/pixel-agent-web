import { useState } from 'react'

interface AgentCreateModalProps {
  onClose: () => void
  onCreate: (provider: string, model: string, systemPrompt?: string) => void
}

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    models: ['gemini-3.1-flash-lite-preview', 'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-opus-4-20250514'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
]

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
}

const modalBody: React.CSSProperties = {
  background: 'var(--pixel-bg, #1e1e2e)',
  border: '2px solid var(--pixel-border, #444)',
  padding: '16px',
  minWidth: 320,
  maxWidth: 400,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  color: 'var(--pixel-text-dim, #aaa)',
  marginBottom: 4,
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '14px',
  background: 'var(--pixel-btn-bg, #2a2a3e)',
  color: 'var(--pixel-text, #eee)',
  border: '1px solid var(--pixel-border, #444)',
  borderRadius: 0,
  marginBottom: 12,
}

const textareaStyle: React.CSSProperties = {
  ...selectStyle,
  minHeight: 60,
  resize: 'vertical',
  fontFamily: 'inherit',
}

const btnStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: '14px',
  background: 'var(--pixel-accent, #6a5acd)',
  color: '#fff',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

export function AgentCreateModal({ onClose, onCreate }: AgentCreateModalProps) {
  const [provider, setProvider] = useState(PROVIDERS[0].id)
  const [model, setModel] = useState(PROVIDERS[0].models[0])
  const [systemPrompt, setSystemPrompt] = useState('')

  const currentProvider = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0]

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const p = PROVIDERS.find((pr) => pr.id === newProvider)
    if (p) setModel(p.models[0])
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBody} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: '18px', color: 'var(--pixel-text, #eee)' }}>
          Create Agent
        </h3>

        <label style={labelStyle}>Provider</label>
        <select
          style={selectStyle}
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label style={labelStyle}>Model</label>
        <select
          style={selectStyle}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {currentProvider.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <label style={labelStyle}>System Prompt (optional)</label>
        <textarea
          style={textareaStyle}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant..."
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            style={{ ...btnStyle, background: 'var(--pixel-btn-bg, #2a2a3e)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={btnStyle}
            onClick={() => onCreate(provider, model, systemPrompt || undefined)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
