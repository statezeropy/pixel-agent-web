import { useState, useEffect } from 'react'
import type { SpriteData } from '../office/types.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'

const CHAR_COUNT = 6
const CHAR_FRAME_W = 16
const CHAR_FRAME_H = 32
const CHAR_FRAMES = 7

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function extractSpriteData(imageData: ImageData, x: number, y: number, w: number, h: number): SpriteData {
  const sprite: SpriteData = []
  const { data, width } = imageData
  for (let row = 0; row < h; row++) {
    const rowData: string[] = []
    for (let col = 0; col < w; col++) {
      const idx = ((y + row) * width + (x + col)) * 4
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3]
      if (a < 128) {
        rowData.push('')
      } else {
        rowData.push('#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0'))
      }
    }
    sprite.push(rowData)
  }
  return sprite
}

async function loadCharacters(): Promise<void> {
  const characters: Array<{ down: SpriteData[]; up: SpriteData[]; right: SpriteData[] }> = []
  for (let i = 0; i < CHAR_COUNT; i++) {
    const img = await loadImage(`/assets/characters/char_${i}.png`)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    const down: SpriteData[] = []
    const up: SpriteData[] = []
    const right: SpriteData[] = []
    for (let frame = 0; frame < CHAR_FRAMES; frame++) {
      const x = frame * CHAR_FRAME_W
      down.push(extractSpriteData(imageData, x, 0, CHAR_FRAME_W, CHAR_FRAME_H))
      up.push(extractSpriteData(imageData, x, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H))
      right.push(extractSpriteData(imageData, x, 2 * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H))
    }
    characters.push({ down, up, right })
  }
  setCharacterTemplates(characters)
}

/**
 * Minimal asset loader that only loads character sprites.
 * Returns true when characters are ready.
 */
export function useCharacterAssets(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadCharacters()
      .then(() => { if (!cancelled) setReady(true) })
      .catch((err) => console.error('[SpriteTest] Failed to load characters:', err))
    return () => { cancelled = true }
  }, [])

  return ready
}
