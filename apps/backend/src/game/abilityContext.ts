import type {
    AttackAbilityId,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
export interface AbilityContext {
    characters: readonly GameCharacter[]
    navigation: NavigationService
    now: number
    random?: () => number
    respawnDelayMsFor?: (target: GameCharacter) => number
    requestAbilityAttack?: (
        actor: GameCharacter,
        targetId: string | undefined,
        abilityId: AttackAbilityId,
        now: number
    ) => GameEventPayload[]
}
export function abilityNotice(
    actor: GameCharacter,
    text: string
): GameEventPayload[] {
    return [
        { kind: 'notice', actorId: actor.id, audienceIds: [actor.id], text },
    ]
}
