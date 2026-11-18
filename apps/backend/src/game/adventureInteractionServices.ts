import type {
    AdventureTradeItemId,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import { interactAdventureNpc } from './adventureDialogue'
import type { PlayerAdventure } from './adventureState'
import { type AdventureTrading, refreshTradeDialogue } from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityWorldState } from './cityWorldState'
import type { NavigationService } from './navigation'
import { extendNpcQuestDialogue } from './npcQuestDialogue'

interface Context {
    service: AdventureService
    stateFor: (id: string) => PlayerAdventure
    trading: () => AdventureTrading
    cities: CityWorldState
    now: () => number
}

export function createAdventureInteractions(context: Context) {
    const refresh = (actor: GameCharacter) => {
        const state = context.stateFor(actor.id)
        setCityRefusal(state, context.cities.tradeRefusal(actor.locationId))
        refreshTradeDialogue(
            actor,
            state.dialogue,
            state.cityTradeBlockedReason
        )
    }
    return {
        interact: (
            actor: GameCharacter,
            npcId: string,
            characters: GameCharacter[],
            navigation?: NavigationService,
            now = context.now(),
            service?: 'shop' | 'orders' | 'repair',
            text?: string
        ): GameEventPayload[] => {
            const state = context.stateFor(actor.id)
            setCityRefusal(state, context.cities.tradeRefusal(actor.locationId))
            const events = extendNpcQuestDialogue(
                context.service,
                actor,
                state,
                interactAdventureNpc(
                    actor,
                    npcId,
                    characters,
                    state,
                    now,
                    navigation,
                    service,
                    text ??
                        context.cities.scriptedGuideGreeting(npcId, actor.id)
                ),
                now
            )
            refresh(actor)
            return events
        },
        trade: (
            actor: GameCharacter,
            itemId: AdventureTradeItemId,
            characters: GameCharacter[],
            navigation?: NavigationService,
            now = context.now()
        ): GameEventPayload[] =>
            context
                .trading()
                .legacy(
                    actor,
                    context.stateFor(actor.id),
                    itemId,
                    characters,
                    navigation,
                    now
                ),
        refresh,
    }
}

function setCityRefusal(
    state: PlayerAdventure,
    reason: string | undefined
): void {
    if (reason === undefined) {
        delete state.cityTradeBlockedReason
    } else {
        state.cityTradeBlockedReason = reason
    }
}
