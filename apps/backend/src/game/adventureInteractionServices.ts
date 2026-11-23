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
    const interact = (
        actor: GameCharacter,
        npcId: string,
        characters: GameCharacter[],
        navigation?: NavigationService,
        now = context.now(),
        service?: 'shop' | 'orders' | 'repair',
        text?: string
    ) => {
        const state = context.stateFor(actor.id)
        setCityRefusal(state, context.cities.tradeRefusal(actor.locationId))
        const result = interactAdventureNpc(
            actor,
            npcId,
            characters,
            state,
            now,
            navigation,
            service,
            text
        )
        if (result.accepted) {
            extendNpcQuestDialogue(context.service, actor, state, now)
            refresh(actor)
        }
        return result
    }
    return {
        interact,
        interactEvents: (...args: Parameters<typeof interact>) =>
            interact(...args).events,
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
