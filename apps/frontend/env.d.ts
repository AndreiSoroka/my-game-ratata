/// <reference types="vite/client" />

import type { WorldSnapshot } from '@my-game-ratata/contracts'

declare global {
    interface Window {
        __ratataGameDebug?: {
            lastSnapshot: WorldSnapshot | undefined
            localPlayerId: string | undefined
            worldToPage: (point: { x: number; y: number }) => { x: number; y: number } | undefined
            buildingCovers?: () => { id: string; visible: boolean }[]
            setCameraZoom?: (zoom: number) => boolean
            captureFrame?: () => Promise<string | undefined>
        }
    }
}

export {}
