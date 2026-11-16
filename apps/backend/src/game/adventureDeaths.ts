import type { GameEventPayload } from '@my-game-ratata/contracts'

import { isQuestTrophyTarget } from './adventureContent'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { setNotice } from './notices'
export function observeAdventureEvents(
    events: GameEventPayload[],
    findCharacter: (id: string) => GameCharacter | undefined,
    observedDeaths: WeakMap<GameCharacter, number>,
    stateFor: (id: string) => PlayerAdventure,
    retire: (id: string) => void
): GameEventPayload[] {
    for (const event of events) {
        if (event.kind === 'permadeath' && event.actorId !== undefined) {
            retire(event.actorId)
        }
        if (event.kind === 'death') {
            observeAdventureDeath(
                event,
                findCharacter,
                observedDeaths,
                stateFor
            )
        }
    }
    return []
}
export function observeAdventureDeath(
    event: GameEventPayload,
    findCharacter: (id: string) => GameCharacter | undefined,
    observedDeaths: WeakMap<GameCharacter, number>,
    stateFor: (id: string) => PlayerAdventure
): void {
    const actor =
        event.actorId === undefined ? undefined : findCharacter(event.actorId)
    const target =
        event.targetId === undefined ? undefined : findCharacter(event.targetId)

    if (actor === undefined || target === undefined) {
        return
    }

    if (
        !isQuestTrophyTarget(actor, target) ||
        observedDeaths.get(target) === target.deathSequence
    ) {
        return
    }

    observedDeaths.set(target, target.deathSequence)
    const state = stateFor(actor.id)

    if (state.questStatus !== 'active') {
        return
    }

    state.kills += 1
    setNotice(
        state,
        'Враждебный слизень повержен. Обыщи его тело и забери сердце.'
    )
}
