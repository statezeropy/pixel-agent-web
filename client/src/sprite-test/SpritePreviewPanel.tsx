import { useRef, useEffect } from 'react'
import { Direction } from '../office/types.js'
import type { SpriteData } from '../office/types.js'
import { getCharacterSprites } from '../office/sprites/spriteData.js'
import { getCachedSprite } from '../office/sprites/spriteCache.js'

const PREVIEW_ZOOM = 3
const FRAME_GAP = 2
const SECTION_GAP = 8
const DIR_ORDER: Direction[] = [Direction.DOWN, Direction.UP, Direction.RIGHT, Direction.LEFT]
const DIR_NAMES: Record<Direction, string> = {
  [Direction.DOWN]: 'Down',
  [Direction.UP]: 'Up',
  [Direction.RIGHT]: 'Right',
  [Direction.LEFT]: 'Left',
}

interface Props {
  palette: number
  hueShift: number
}

function drawFrameRow(
  ctx: CanvasRenderingContext2D,
  frames: SpriteData[],
  label: string,
  y: number,
  zoom: number,
): number {
  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '10px monospace'
  ctx.fillText(label, 2, y + 10)

  const labelH = 14
  let x = 2
  for (const frame of frames) {
    const cached = getCachedSprite(frame, zoom)
    ctx.drawImage(cached, x, y + labelH)
    x += cached.width + FRAME_GAP
  }

  const spriteH = frames[0] ? frames[0].length * zoom : 0
  return y + labelH + spriteH + SECTION_GAP
}

export function SpritePreviewPanel({ palette, hueShift }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const sprites = getCharacterSprites(palette, hueShift)
    const ctx = canvas.getContext('2d')!

    // Calculate canvas size
    // 3 sections (walk, typing, reading) x 4 directions
    const sampleFrame = sprites.walk[Direction.DOWN][0]
    const frameW = sampleFrame[0].length * PREVIEW_ZOOM
    const frameH = sampleFrame.length * PREVIEW_ZOOM
    const labelH = 14
    const rowH = labelH + frameH + SECTION_GAP

    const totalH = rowH * 12 + SECTION_GAP * 3 + 20 // 3 sections x 4 dirs + headers
    const totalW = Math.max(260, 4 * (frameW + FRAME_GAP) + 4)

    canvas.width = totalW
    canvas.height = totalH
    ctx.clearRect(0, 0, totalW, totalH)

    let y = 0

    // Section: Walk (4 frames per direction)
    ctx.fillStyle = 'rgba(90, 140, 255, 0.8)'
    ctx.font = 'bold 12px monospace'
    ctx.fillText('WALK (4 frames)', 2, y + 12)
    y += 18

    for (const dir of DIR_ORDER) {
      y = drawFrameRow(ctx, [...sprites.walk[dir]], DIR_NAMES[dir], y, PREVIEW_ZOOM)
    }

    // Section: Typing (2 frames per direction)
    ctx.fillStyle = 'rgba(90, 200, 140, 0.8)'
    ctx.fillText('TYPING (2 frames)', 2, y + 12)
    y += 18

    for (const dir of DIR_ORDER) {
      y = drawFrameRow(ctx, [...sprites.typing[dir]], DIR_NAMES[dir], y, PREVIEW_ZOOM)
    }

    // Section: Reading (2 frames per direction)
    ctx.fillStyle = 'rgba(200, 160, 90, 0.8)'
    ctx.fillText('READING (2 frames)', 2, y + 12)
    y += 18

    for (const dir of DIR_ORDER) {
      y = drawFrameRow(ctx, [...sprites.reading[dir]], DIR_NAMES[dir], y, PREVIEW_ZOOM)
    }
  }, [palette, hueShift])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '2px solid var(--pixel-border)',
      padding: 8,
    }}>
      <canvas
        ref={canvasRef}
        style={{ imageRendering: 'pixelated', width: '100%' }}
      />
    </div>
  )
}
