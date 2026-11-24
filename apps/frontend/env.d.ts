/// <reference types="vite/client" />

import type { WorldSnapshot } from '@my-game-ratata/contracts'

import type { DrawnOwnerPose } from './src/game/runtime/networkMotion'
import type { PrayerAreaState } from './src/game/runtime/prayerAreaViews'

declare global {
    interface Window {
        __ratataGameDebug?: {
            lastSnapshot: WorldSnapshot | undefined
            localPlayerId: string | undefined
            worldToPage: (point: { x: number; y: number }) => { x: number; y: number } | undefined
            buildingCovers?: () => { id: string; visible: boolean }[]
            setCameraZoom?: (zoom: number) => boolean
            captureFrame?: () => Promise<string | undefined>
            prayerAreas?: () => PrayerAreaState[]
            characterOpacity?: (id: string) => number | undefined
            characterNameOpacity?: (id: string) => number | undefined
            heardFootstepIds?: () => number[]
            renderedCharacters?: () => { id: string; position: { x: number; y: number } }[]
            lastDrawnOwnerPose?: () => DrawnOwnerPose | undefined
        }
    }
}

export {}
