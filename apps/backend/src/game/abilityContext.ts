import type {
    AshRiteMessage,
    AttackAbilityId,
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GraveCombatContext } from './graveRules'
import type { MagicCombat } from './magicCombat'
import type { NavigationService } from './navigation'
export interface AbilityContext {
    useAshRite?:
        | ((
              actor: GameCharacter,
              message: AshRiteMessage,
              context: AbilityContext
          ) => GameEventPayload[])
        | undefined
    graves?: GraveCombatContext | undefined
    characters: readonly GameCharacter[]
    navigation: NavigationService
    now: number
    random?: () => number
    sameParty?: (firstId: string, secondId: string) => boolean
    magic?: MagicCombat
    canOpenPortal?: (actor: GameCharacter, now: number) => boolean
    openPortal?: (
        actor: GameCharacter,
        now: number
    ) => GameEventPayload[] | undefined
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
