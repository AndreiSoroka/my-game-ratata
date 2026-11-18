import type {
    AdventureClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import {
    type AdventureCommandServices,
    executeAdventureCommand,
    resolveAdventureService,
} from './adventureCommands'
import { type AdventureResources } from './adventureResources'
import type { PlayerAdventure } from './adventureState'
import type { AdventureActionResult } from './adventureTrading'
import { resolvedAdventureAction } from './adventureViews'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import type { WorldObjects } from './worldObjects'

interface RequestContext {
    service: AdventureService
    services: () => AdventureCommandServices
    resources: () => AdventureResources
    objects: () => WorldObjects
    stateFor: (id: string) => PlayerAdventure
    permission: (
        actor: GameCharacter,
        message: AdventureClientMessage
    ) => boolean
    now: () => number
}
type Handle = (
    actor: GameCharacter,
    message: AdventureClientMessage,
    characters: GameCharacter[],
    navigation?: NavigationService,
    now?: number
) => GameEventPayload[]
type HandleResult = (
    actor: GameCharacter,
    message: AdventureClientMessage,
    characters: GameCharacter[],
    navigation: NavigationService | undefined,
    now: number
) => AdventureActionResult

export function createAdventureRequests(context: RequestContext): {
    handle: Handle
    handleResult: HandleResult
} {
    const refusal = (actor: GameCharacter, message: AdventureClientMessage) => {
        if (context.permission(actor, message)) {
            return undefined
        }
        const error =
            'Работа приостановлена до завершения обращения за помощью.'
        context.service.reportWorkProblem(actor, error)
        return { accepted: false, error, events: [] }
    }
    return {
        handle: (
            actor,
            message,
            characters,
            navigation,
            now = context.now()
        ) => {
            if (refusal(actor, message) !== undefined) {
                return []
            }
            return executeAdventureCommand(
                {
                    ...context.services(),
                    service: context.service,
                    resources: context.resources(),
                    worldObjects: context.objects(),
                    state: context.stateFor(actor.id),
                },
                actor,
                message,
                characters,
                navigation,
                now
            )
        },
        handleResult: (actor, message, characters, navigation, now) => {
            const error = refusal(actor, message)
            if (error !== undefined) {
                return error
            }
            if (message.type === 'world_interact') {
                const opened = context
                    .objects()
                    .open(actor, message.objectId, now)
                if (opened !== undefined) {
                    return opened
                }
            }
            return (
                resolveAdventureService(
                    context.services(),
                    actor,
                    context.stateFor(actor.id),
                    message,
                    characters,
                    navigation,
                    now
                ) ??
                resolvedAdventureAction(
                    context.service,
                    context.stateFor(actor.id),
                    actor,
                    message,
                    characters,
                    navigation,
                    now
                )
            )
        },
    }
}
