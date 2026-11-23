import type { ClientMessage, GameEventPayload } from '@my-game-ratata/contracts'
import type { CityBellState } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { SpeechTranslator } from '../game/speechTranslation'
import type { WorldMaps } from '../game/worldMaps'
import { NpcAiCoordinator } from './coordinator'
import type { NpcAiDiagnostics } from './diagnostics'
import type { NpcAiConfig, NpcAiProvider } from './types'

export interface GameRoomOptions {
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
              ai.clock,
              ai.diagnostics
          )
}

export function deliverNpcAiRequest(
    ai: NpcAiCoordinator | undefined,
    actor: GameCharacter,
    message: ClientMessage,
    events: GameEventPayload[],
    now: number
): void {
    if (ai === undefined || message.type !== 'companion_request') {
        return
    }
    if (message.request === 'talk') {
        if (
            events.some(
                (event) =>
                    event.kind === 'chat' &&
                    event.actorId === message.targetId &&
                    event.targetId === actor.id
            )
        ) {
            ai.talk(actor, message, now)
        }
    } else {
        ai.dismiss(actor, message.targetId, now, message.request)
    }
}

export function createNpcAiRequestReceiver(
    current: () => NpcAiCoordinator | undefined
) {
    return (
        actor: GameCharacter,
        message: ClientMessage,
        events: GameEventPayload[],
        now: number
    ): void => deliverNpcAiRequest(current(), actor, message, events, now)
}
