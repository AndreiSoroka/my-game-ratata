import type {
    AttackAbilityId,
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GraveCombatContext } from './graveRules'
import type { NavigationService } from './navigation'
export interface AbilityContext {
    graves?: GraveCombatContext | undefined
    characters: readonly GameCharacter[]
    navigation: NavigationService
    now: number
    random?: () => number
    respawnDelayMsFor?: (target: GameCharacter) => number
    requestAbilityAttack?: (
        actor: GameCharacter,
        targetId: string | undefined,
        abilityId: AttackAbilityId,
        now: number,
        target?: WorldCombatTarget
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
