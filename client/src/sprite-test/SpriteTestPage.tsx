import { useState, useEffect, useRef, useCallback } from 'react'
import { CharacterState, Direction } from '../office/types.js'
import type { Character, SpriteData } from '../office/types.js'
import { getCharacterSprites, BUBBLE_PERMISSION_SPRITE, BUBBLE_WAITING_SPRITE, BUBBLE_ERROR_SPRITE, BUBBLE_THINKING_SPRITE } from '../office/sprites/spriteData.js'
import { getCachedSprite, getOutlineSprite } from '../office/sprites/spriteCache.js'
import { getCharacterSprite } from '../office/engine/characters.js'
import { renderMatrixEffect } from '../office/engine/matrixEffect.js'
import {
  TILE_SIZE,
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  PALETTE_COUNT,
  CHARACTER_SITTING_OFFSET_PX,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  MATRIX_EFFECT_DURATION_SEC,
} from '../constants.js'
import { useCharacterAssets } from './useCharacterAssets.js'
import { SpritePreviewPanel } from './SpritePreviewPanel.js'

const GRID_COLS = 16
const GRID_ROWS = 10
const DIR_LABELS: Record<Direction, string> = {
  [Direction.DOWN]: 'Down',
  [Direction.LEFT]: 'Left',
  [Direction.RIGHT]: 'Right',
  [Direction.UP]: 'Up',
}

type AnimState = 'idle' | 'walk' | 'typing' | 'reading'
type BubbleState = 'none' | 'permission' | 'waiting' | 'error' | 'thinking'

function createTestCharacter(palette: number): Character {
  const col = Math.floor(GRID_COLS / 2)
  const row = Math.floor(GRID_ROWS / 2)
  return {
    state: CharacterState.IDLE,
    dir: Direction.DOWN,
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
    tileCol: col,
    tileRow: row,
    frame: 0,
    frameTimer: 0,
    currentTool: null,
    palette,
    hueShift: 0,
    id: 0,
    path: [],
    moveProgress: 0,
    isActive: false,
    seatId: null,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: 0,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
  }
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '2px solid var(--pixel-border)',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--pixel-text-dim)',
  marginBottom: 2,
}

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '14px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  cursor: 'pointer',
}

const btnActiveStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--pixel-active-bg)',
  color: '#fff',
  borderColor: 'var(--pixel-accent)',
}

function generateSeeds(): number[] {
  const seeds: number[] = []
  for (let i = 0; i < 16; i++) seeds.push(Math.random())
  return seeds
}

export function SpriteTestPage() {
  const assetsReady = useCharacterAssets()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const charRef = useRef(createTestCharacter(0))
  const keysRef = useRef(new Set<string>())

  // Refs for values that need to be read in animation loop without re-creating effect
  const animStateRef = useRef<AnimState>('idle')
  const bubbleStateRef = useRef<BubbleState>('none')
  const showOutlineRef = useRef(false)
  const showSittingRef = useRef(false)
  const showGridRef = useRef(true)
  const zoomRef = useRef(4)
  const speedRef = useRef(1)

  const [palette, setPalette] = useState(0)
  const [hueShift, setHueShift] = useState(0)
  const [zoom, setZoom] = useState(4)
  const [speed, setSpeed] = useState(1)
  const [animState, setAnimState] = useState<AnimState>('idle')
  const [bubbleState, setBubbleState] = useState<BubbleState>('none')
  const [showOutline, setShowOutline] = useState(false)
  const [showSitting, setShowSitting] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showPreview, setShowPreview] = useState(true)
  const [tick, setTick] = useState(0)

  // Keep refs in sync
  useEffect(() => { animStateRef.current = animState }, [animState])
  useEffect(() => { bubbleStateRef.current = bubbleState }, [bubbleState])
  useEffect(() => { showOutlineRef.current = showOutline }, [showOutline])
  useEffect(() => { showSittingRef.current = showSitting }, [showSitting])
  useEffect(() => { showGridRef.current = showGrid }, [showGrid])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { speedRef.current = speed }, [speed])

  // Sync palette/hueShift to character
  useEffect(() => {
    charRef.current.palette = palette
    charRef.current.hueShift = hueShift
  }, [palette, hueShift])

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        keysRef.current.add(e.key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Single animation loop — reads everything from refs
  useEffect(() => {
    if (!assetsReady) return

    let lastTime = performance.now()
    let animId = 0

    function loop(now: number) {
      const rawDt = (now - lastTime) / 1000
      const dt = Math.min(rawDt, 0.1) * speedRef.current
      lastTime = now

      const ch = charRef.current
      const keys = keysRef.current
      const canvas = canvasRef.current
      if (!canvas) { animId = requestAnimationFrame(loop); return }

      const ctx = canvas.getContext('2d')!
      const z = zoomRef.current
      const mapW = GRID_COLS * TILE_SIZE * z
      const mapH = GRID_ROWS * TILE_SIZE * z

      if (canvas.width !== mapW || canvas.height !== mapH) {
        canvas.width = mapW
        canvas.height = mapH
      }

      // --- Update matrix effect ---
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION_SEC) {
          if (ch.matrixEffect === 'despawn') {
            // After despawn, immediately start spawn
            ch.matrixEffect = 'spawn'
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = generateSeeds()
          } else {
            ch.matrixEffect = null
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = []
          }
        }
      }

      // --- Update character state ---
      const moving = keys.size > 0 && !ch.matrixEffect
      if (moving) {
        if (keys.has('ArrowDown')) ch.dir = Direction.DOWN
        if (keys.has('ArrowUp')) ch.dir = Direction.UP
        if (keys.has('ArrowLeft')) ch.dir = Direction.LEFT
        if (keys.has('ArrowRight')) ch.dir = Direction.RIGHT

        const spd = WALK_SPEED_PX_PER_SEC * dt
        if (keys.has('ArrowDown')) ch.y += spd
        if (keys.has('ArrowUp')) ch.y -= spd
        if (keys.has('ArrowRight')) ch.x += spd
        if (keys.has('ArrowLeft')) ch.x -= spd

        ch.x = Math.max(TILE_SIZE / 2, Math.min(ch.x, GRID_COLS * TILE_SIZE - TILE_SIZE / 2))
        ch.y = Math.max(TILE_SIZE / 2, Math.min(ch.y, GRID_ROWS * TILE_SIZE - TILE_SIZE / 2))
        ch.tileCol = Math.floor(ch.x / TILE_SIZE)
        ch.tileRow = Math.floor(ch.y / TILE_SIZE)

        ch.state = CharacterState.WALK
        ch.frameTimer += dt
        if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
          ch.frameTimer -= WALK_FRAME_DURATION_SEC
          ch.frame = (ch.frame + 1) % 4
        }
      } else if (!ch.matrixEffect) {
        const st = animStateRef.current
        if (st === 'idle') {
          ch.state = CharacterState.IDLE
          ch.frame = 0
          ch.frameTimer = 0
        } else if (st === 'walk') {
          ch.state = CharacterState.WALK
          ch.frameTimer += dt
          if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
            ch.frameTimer -= WALK_FRAME_DURATION_SEC
            ch.frame = (ch.frame + 1) % 4
          }
        } else if (st === 'typing') {
          ch.state = CharacterState.TYPE
          ch.currentTool = null
          ch.frameTimer += dt
          if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
            ch.frameTimer -= TYPE_FRAME_DURATION_SEC
            ch.frame = (ch.frame + 1) % 2
          }
        } else if (st === 'reading') {
          ch.state = CharacterState.TYPE
          ch.currentTool = 'Read'
          ch.frameTimer += dt
          if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
            ch.frameTimer -= TYPE_FRAME_DURATION_SEC
            ch.frame = (ch.frame + 1) % 2
          }
        }
      }

      // Sync bubble state
      const bs = bubbleStateRef.current
      ch.bubbleType = bs === 'none' ? null : bs
      if (ch.bubbleType) ch.bubbleTimer = 2 // keep visible

      // --- Render ---
      ctx.clearRect(0, 0, mapW, mapH)

      // Checkerboard floor
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#2a2a3a' : '#2e2e3e'
          ctx.fillRect(c * TILE_SIZE * z, r * TILE_SIZE * z, TILE_SIZE * z, TILE_SIZE * z)
        }
      }

      // Grid lines
      if (showGridRef.current) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        for (let c = 0; c <= GRID_COLS; c++) {
          const x = c * TILE_SIZE * z
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapH); ctx.stroke()
        }
        for (let r = 0; r <= GRID_ROWS; r++) {
          const y = r * TILE_SIZE * z
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapW, y); ctx.stroke()
        }
      }

      // Character rendering
      const sprites = getCharacterSprites(ch.palette, ch.hueShift)
      const spriteData = getCharacterSprite(ch, sprites)
      const cached = getCachedSprite(spriteData, z)
      const sittingOff = (showSittingRef.current && ch.state === CharacterState.TYPE) ? CHARACTER_SITTING_OFFSET_PX : 0
      const drawX = Math.round(ch.x * z - cached.width / 2)
      const drawY = Math.round((ch.y + sittingOff) * z - cached.height)

      if (ch.matrixEffect) {
        // Matrix effect rendering
        renderMatrixEffect(ctx, ch, spriteData, drawX, drawY, z)
      } else {
        // Outline
        if (showOutlineRef.current) {
          const outlineData = getOutlineSprite(spriteData)
          const outlineCached = getCachedSprite(outlineData, z)
          ctx.drawImage(outlineCached, drawX - z, drawY - z)
        }

        // Character sprite
        ctx.drawImage(cached, drawX, drawY)
      }

      // Bubble
      if (ch.bubbleType && !ch.matrixEffect) {
        let bubbleSprite: SpriteData
        switch (ch.bubbleType) {
          case 'permission': bubbleSprite = BUBBLE_PERMISSION_SPRITE; break
          case 'error': bubbleSprite = BUBBLE_ERROR_SPRITE; break
          case 'thinking': bubbleSprite = BUBBLE_THINKING_SPRITE; break
          default: bubbleSprite = BUBBLE_WAITING_SPRITE; break
        }
        const bubbleCached = getCachedSprite(bubbleSprite, z)
        const bSittingOff = (showSittingRef.current && ch.state === CharacterState.TYPE) ? BUBBLE_SITTING_OFFSET_PX : 0
        const bubbleX = Math.round(ch.x * z - bubbleCached.width / 2)
        const bubbleY = Math.round((ch.y + bSittingOff - BUBBLE_VERTICAL_OFFSET_PX) * z - bubbleCached.height - z)
        ctx.drawImage(bubbleCached, bubbleX, bubbleY)
      }

      // Position marker
      ctx.fillStyle = 'rgba(255, 100, 100, 0.4)'
      ctx.beginPath()
      ctx.arc(ch.x * z, ch.y * z, 2, 0, Math.PI * 2)
      ctx.fill()

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)
    const infoInterval = setInterval(() => setTick((n) => n + 1), 100)

    return () => {
      cancelAnimationFrame(animId)
      clearInterval(infoInterval)
    }
  }, [assetsReady])

  const handleDirectionClick = useCallback((dir: Direction) => {
    charRef.current.dir = dir
  }, [])

  const handleMatrixSpawn = useCallback(() => {
    const ch = charRef.current
    ch.matrixEffect = 'spawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = generateSeeds()
  }, [])

  const handleMatrixDespawn = useCallback(() => {
    const ch = charRef.current
    ch.matrixEffect = 'despawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = generateSeeds()
  }, [])

  if (!assetsReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pixel-text-dim)' }}>
        <div style={{ fontSize: '24px' }}>Loading character sprites...</div>
      </div>
    )
  }

  const ch = charRef.current
  void tick

  const displayState = ch.matrixEffect
    ? `matrix:${ch.matrixEffect}`
    : ch.state === CharacterState.TYPE && ch.currentTool === 'Read'
      ? 'reading'
      : ch.state

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', gap: 0, overflow: 'hidden' }}>
      {/* Canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 16 }}>
        <div style={{ fontSize: '20px', color: 'var(--pixel-text)', marginBottom: 8 }}>
          Sprite Test Harness
        </div>
        <div style={{ fontSize: '13px', color: 'var(--pixel-text-dim)', marginBottom: 12 }}>
          Arrow keys to move
        </div>
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: 'pixelated',
            border: '2px solid var(--pixel-border)',
            boxShadow: 'var(--pixel-shadow)',
          }}
        />
        {/* Info bar */}
        <div style={{ marginTop: 8, fontSize: '13px', color: 'var(--pixel-text-dim)', display: 'flex', gap: 16 }}>
          <span>State: <b>{displayState}</b></span>
          <span>Dir: {DIR_LABELS[ch.dir]}</span>
          <span>Frame: {ch.frame}</span>
          <span>Pos: ({Math.round(ch.x)}, {Math.round(ch.y)})</span>
          <span>Tile: ({ch.tileCol}, {ch.tileRow})</span>
          {ch.bubbleType && <span>Bubble: {ch.bubbleType}</span>}
        </div>
      </div>

      {/* Control panel */}
      <div style={{
        width: 280,
        minWidth: 280,
        height: '100%',
        overflowY: 'auto',
        background: 'var(--pixel-bg)',
        borderLeft: '2px solid var(--pixel-border)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Palette */}
        <div style={panelStyle}>
          <div style={labelStyle}>Palette</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: PALETTE_COUNT }, (_, i) => (
              <button key={i} style={palette === i ? btnActiveStyle : btnStyle} onClick={() => setPalette(i)}>{i}</button>
            ))}
          </div>
        </div>

        {/* Hue Shift */}
        <div style={panelStyle}>
          <div style={labelStyle}>Hue Shift: {hueShift}deg</div>
          <input type="range" min={0} max={360} value={hueShift} onChange={(e) => setHueShift(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        {/* Animation State */}
        <div style={panelStyle}>
          <div style={labelStyle}>Animation</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['idle', 'walk', 'typing', 'reading'] as AnimState[]).map((st) => (
              <button key={st} style={animState === st ? btnActiveStyle : btnStyle} onClick={() => setAnimState(st)}>
                {st === 'idle' ? 'Idle' : st === 'walk' ? 'Walk' : st === 'typing' ? 'Typing' : 'Reading'}
              </button>
            ))}
          </div>
        </div>

        {/* Direction */}
        <div style={panelStyle}>
          <div style={labelStyle}>Direction</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 120 }}>
            <div />
            <button style={ch.dir === Direction.UP ? btnActiveStyle : btnStyle} onClick={() => handleDirectionClick(Direction.UP)}>Up</button>
            <div />
            <button style={ch.dir === Direction.LEFT ? btnActiveStyle : btnStyle} onClick={() => handleDirectionClick(Direction.LEFT)}>Lt</button>
            <button style={ch.dir === Direction.DOWN ? btnActiveStyle : btnStyle} onClick={() => handleDirectionClick(Direction.DOWN)}>Dn</button>
            <button style={ch.dir === Direction.RIGHT ? btnActiveStyle : btnStyle} onClick={() => handleDirectionClick(Direction.RIGHT)}>Rt</button>
          </div>
        </div>

        {/* Bubbles */}
        <div style={panelStyle}>
          <div style={labelStyle}>Bubble</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['none', 'thinking', 'waiting', 'permission', 'error'] as BubbleState[]).map((bs) => (
              <button key={bs} style={bubbleState === bs ? btnActiveStyle : btnStyle} onClick={() => setBubbleState(bs)}>
                {bs === 'none' ? 'None' : bs.charAt(0).toUpperCase() + bs.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Matrix Effect */}
        <div style={panelStyle}>
          <div style={labelStyle}>Matrix Effect</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={btnStyle} onClick={handleMatrixSpawn}>Spawn</button>
            <button style={btnStyle} onClick={handleMatrixDespawn}>Despawn</button>
          </div>
        </div>

        {/* Visual Options */}
        <div style={panelStyle}>
          <div style={labelStyle}>Visual</div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} />
            Selection Outline
          </label>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showSitting} onChange={(e) => setShowSitting(e.target.checked)} />
            Sitting Offset (TYPE)
          </label>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Grid Lines
          </label>
        </div>

        {/* Zoom */}
        <div style={panelStyle}>
          <div style={labelStyle}>Zoom: {zoom}x</div>
          <input type="range" min={1} max={8} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        {/* Speed */}
        <div style={panelStyle}>
          <div style={labelStyle}>Speed: {speed.toFixed(2)}x</div>
          <input type="range" min={0.25} max={4} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        {/* Sprite Preview */}
        <div style={panelStyle}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} />
            Sprite Sheet
          </label>
        </div>
        {showPreview && (
          <SpritePreviewPanel palette={palette} hueShift={hueShift} />
        )}
      </div>
    </div>
  )
}
