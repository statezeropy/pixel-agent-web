/**
 * Browser-based asset loader hook.
 *
 * Replaces the VS Code extension's server-side PNG loading with client-side
 * Canvas API loading. Loads character, floor, wall, and furniture sprites
 * from /assets/ and calls the appropriate setter functions.
 */

import { useState, useEffect, useRef } from 'react'
import type { SpriteData } from '../office/types.js'
import type { LoadedAssetData } from '../office/layout/furnitureCatalog.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'

// ── Constants ────────────────────────────────────────────────────

const CHAR_COUNT = 6
const CHAR_FRAME_W = 16
const CHAR_FRAME_H = 32
const CHAR_FRAMES = 7

const FLOOR_PATTERN_COUNT = 7
const FLOOR_TILE_SIZE = 16

const WALL_COLS = 4
const WALL_ROWS = 4
const WALL_TILE_W = 16
const WALL_TILE_H = 32

// ── Public types ─────────────────────────────────────────────────

export interface AssetLoadState {
  characters: boolean
  floors: boolean
  walls: boolean
  furniture: boolean
  allReady: boolean
  loadedAssets?: LoadedAssetData
}

// ── Helper functions ─────────────────────────────────────────────

/** Load an image from a URL and return the HTMLImageElement once decoded. */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (_e) => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Extract a rectangular region from ImageData and convert to SpriteData.
 * Alpha < 128 → '' (transparent), alpha >= 128 → '#RRGGBB' (opaque).
 */
function extractSpriteData(
  imageData: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
): SpriteData {
  const sprite: SpriteData = []
  const { data, width } = imageData

  for (let row = 0; row < h; row++) {
    const rowData: string[] = []
    for (let col = 0; col < w; col++) {
      const idx = ((y + row) * width + (x + col)) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]

      if (a < 128) {
        rowData.push('')
      } else {
        const hex =
          '#' +
          r.toString(16).padStart(2, '0') +
          g.toString(16).padStart(2, '0') +
          b.toString(16).padStart(2, '0')
        rowData.push(hex)
      }
    }
    sprite.push(rowData)
  }

  return sprite
}

/** Load a single PNG from a URL and return its full SpriteData. */
async function loadSpriteFromUrl(url: string): Promise<SpriteData> {
  const img = await loadImage(url)

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return extractSpriteData(imageData, 0, 0, canvas.width, canvas.height)
}

/**
 * Get ImageData from an HTMLImageElement using an offscreen canvas.
 */
function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// ── Loaders ──────────────────────────────────────────────────────

/**
 * Load all 6 character sprite sheets and split into direction/frame arrays.
 * Each character PNG is 112x96 → 7 frames wide × 3 directions tall (16×32 each).
 * Directions: row 0=down, row 1=up, row 2=right.
 */
async function loadCharacters(): Promise<void> {
  const characters: Array<{ down: SpriteData[]; up: SpriteData[]; right: SpriteData[] }> = []

  for (let i = 0; i < CHAR_COUNT; i++) {
    const url = `/assets/characters/char_${i}.png`
    const img = await loadImage(url)
    const imageData = getImageData(img)

    const down: SpriteData[] = []
    const up: SpriteData[] = []
    const right: SpriteData[] = []

    for (let frame = 0; frame < CHAR_FRAMES; frame++) {
      const x = frame * CHAR_FRAME_W

      down.push(extractSpriteData(imageData, x, 0 * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H))
      up.push(extractSpriteData(imageData, x, 1 * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H))
      right.push(extractSpriteData(imageData, x, 2 * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H))
    }

    characters.push({ down, up, right })
  }

  setCharacterTemplates(characters)
  console.log(`[AssetLoader] Loaded ${characters.length} character sprite sheets`)
}

/**
 * Load floors.png and split into 7 floor tile patterns (16×16 each).
 * The image is 112×16 — 7 patterns laid out horizontally.
 */
async function loadFloors(): Promise<void> {
  const url = '/assets/floors.png'
  const img = await loadImage(url)
  const imageData = getImageData(img)

  const sprites: SpriteData[] = []
  for (let i = 0; i < FLOOR_PATTERN_COUNT; i++) {
    sprites.push(
      extractSpriteData(imageData, i * FLOOR_TILE_SIZE, 0, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE),
    )
  }

  setFloorSprites(sprites)
  console.log(`[AssetLoader] Loaded ${sprites.length} floor tile patterns`)
}

/**
 * Load walls.png and split into 16 wall tile sprites (4×4 grid of 16×32 tiles).
 * Row-major order: index = row * 4 + col, mapping to bitmask 0-15.
 */
async function loadWalls(): Promise<void> {
  const url = '/assets/walls.png'
  const img = await loadImage(url)
  const imageData = getImageData(img)

  const sprites: SpriteData[] = []
  for (let row = 0; row < WALL_ROWS; row++) {
    for (let col = 0; col < WALL_COLS; col++) {
      sprites.push(
        extractSpriteData(
          imageData,
          col * WALL_TILE_W,
          row * WALL_TILE_H,
          WALL_TILE_W,
          WALL_TILE_H,
        ),
      )
    }
  }

  setWallSprites(sprites)
  console.log(`[AssetLoader] Loaded ${sprites.length} wall tile sprites`)
}

/**
 * Fetch the furniture catalog JSON and load each furniture PNG sprite.
 * Returns the loaded assets data for state tracking.
 */
async function loadFurniture(): Promise<LoadedAssetData> {
  const catalogUrl = '/assets/furniture/furniture-catalog.json'
  const response = await fetch(catalogUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch furniture catalog: ${response.status}`)
  }

  const catalog = (await response.json()) as LoadedAssetData['catalog']
  const sprites: Record<string, SpriteData> = {}

  // Load all furniture PNGs in parallel (batched to avoid overwhelming the browser)
  const BATCH_SIZE = 20
  for (let i = 0; i < catalog.length; i += BATCH_SIZE) {
    const batch = catalog.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        const spriteUrl = `/assets/furniture/${asset.category}/${asset.id}.png`
        const sprite = await loadSpriteFromUrl(spriteUrl)
        return { id: asset.id, sprite }
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        sprites[result.value.id] = result.value.sprite
      } else {
        console.warn(`[AssetLoader] Failed to load furniture sprite:`, result.reason)
      }
    }
  }

  const assetData: LoadedAssetData = { catalog, sprites }
  buildDynamicCatalog(assetData)
  console.log(
    `[AssetLoader] Loaded ${Object.keys(sprites).length}/${catalog.length} furniture sprites`,
  )

  return assetData
}

// ── Hook ─────────────────────────────────────────────────────────

export function useAssetLoader(): AssetLoadState {
  const [state, setState] = useState<AssetLoadState>({
    characters: false,
    floors: false,
    walls: false,
    furniture: false,
    allReady: false,
  })

  const startedRef = useRef(false)

  useEffect(() => {
    // Prevent double-loading in StrictMode
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false

    async function loadAll(): Promise<void> {
      // Load characters (required)
      try {
        await loadCharacters()
        if (cancelled) return
        setState((prev) => {
          const next = { ...prev, characters: true }
          next.allReady = next.characters && next.walls
          return next
        })
      } catch (err) {
        console.error('[AssetLoader] Failed to load characters:', err)
      }

      // Load walls (required)
      try {
        await loadWalls()
        if (cancelled) return
        setState((prev) => {
          const next = { ...prev, walls: true }
          next.allReady = next.characters && next.walls
          return next
        })
      } catch (err) {
        console.error('[AssetLoader] Failed to load walls:', err)
      }

      // Load floors (optional — may not exist for free tileset)
      try {
        await loadFloors()
        if (cancelled) return
        setState((prev) => ({ ...prev, floors: true }))
      } catch (err) {
        console.warn('[AssetLoader] Floors not available (using fallback):', err)
        if (!cancelled) {
          setState((prev) => ({ ...prev, floors: true }))
        }
      }

      // Load furniture (optional — may not exist)
      try {
        const loadedAssets = await loadFurniture()
        if (cancelled) return
        setState((prev) => ({ ...prev, furniture: true, loadedAssets }))
      } catch (err) {
        console.warn('[AssetLoader] Furniture not available (using built-in sprites):', err)
        if (!cancelled) {
          setState((prev) => ({ ...prev, furniture: true }))
        }
      }
    }

    loadAll()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
