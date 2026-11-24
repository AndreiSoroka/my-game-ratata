import {
    type AshRiteMessage,
    type AttackAbilityId,
    authoredPhrase,
    type AuthoredTextKey,
    type GameEventPayload,
    type Vector2,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GraveCombatContext } from './graveRules'
import type { MagicCombat } from './magicCombat'
import type { NavigationService } from './navigation'

export type OnProjectileRelease = (
    actor: GameCharacter,
    origin: Vector2
) => void

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
    onProjectileRelease?: OnProjectileRelease | undefined
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

export function authoredAbilityNotice(
    actor: GameCharacter,
    key: AuthoredTextKey
): GameEventPayload[] {
    return [
        {
            kind: 'notice',
            actorId: actor.id,
            audienceIds: [actor.id],
            ...authoredPhrase(key),
        },
    ]
}
export function abilityNotice(
    actor: GameCharacter,
    text: string
): GameEventPayload[] {
    return [
        { kind: 'notice', actorId: actor.id, audienceIds: [actor.id], text },
    ]
}
