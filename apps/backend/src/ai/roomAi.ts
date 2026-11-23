import type { CityBellState, WorldEmptyMode } from '@my-game-ratata/contracts'

import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { SpeechTranslator } from '../game/speechTranslation'
import type { WorldMaps } from '../game/worldMaps'
import { NpcAiCoordinator } from './coordinator'
import type { NpcAiDiagnostics } from './diagnostics'
import type { NpcAiConfig, NpcAiProvider } from './types'

export interface GameRoomOptions {
    emptyWorldMode?: WorldEmptyMode
    worldClock?: () => number
    worldMaps?: WorldMaps
    worldSeed?: string
    initialBellState?: CityBellState
    npcIdentitySeed?: string
    npcSpeechSeed?: string
    speechTranslator?: SpeechTranslator
    ai?: {
        config: NpcAiConfig
        provider: NpcAiProvider
        clock?: () => number
        diagnostics?: NpcAiDiagnostics
    }
}

export function createNpcAiCoordinator(
    room: GameRoom,
    companions: CompanionService,
    options: GameRoomOptions
): NpcAiCoordinator | undefined {
    const ai = options.ai
    return ai === undefined
        ? undefined
        : new NpcAiCoordinator(
              room,
              companions,
              ai.config,
              ai.provider,
              ai.clock ?? room.gameplayNow,
              ai.diagnostics
          )
}
