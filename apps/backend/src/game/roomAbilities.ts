import type {
    AbilityClientMessage,
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from './abilityCommands'
import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { attemptAbilityAttack } from './combat'
import type { GraveCombatContext } from './graveRules'
import { attackRoomCharacter } from './roomCombat'
import { resolveRespawnDelayMs } from './roomSimulation'
import type { WorldLocations } from './worldLocations'
export function createRoomCombatActions(
    world: () => WorldLocations,
    characters: () => Map<string, GameCharacter>,
    publish: (events: GameEventPayload[]) => void,
    graves?: GraveCombatContext
) {
    const charactersFor = (actor: GameCharacter) =>
        [...characters().values()].filter(
            (target) => target.locationId === actor.locationId
        )
    const contextFor = (actor: GameCharacter, now: number): AbilityContext => ({
        characters: charactersFor(actor),
        ...(graves === undefined ? {} : { graves }),
        navigation: world().get(actor.locationId).navigation,
        now,
        requestAbilityAttack: (attacker, targetId, abilityId, time, target) =>
            attemptAbilityAttack(
                {
                    actor: attacker,
                    targetId,
                    target,
                    graves,
                    targets: charactersFor(attacker),
                    navigation: world().get(attacker.locationId).navigation,
                    tileSize: world().get(attacker.locationId).navigation.grid
                        .tileWidth,
                    now: time,
                    respawnDelayMsFor: resolveRespawnDelayMs,
                },
                abilityId
            ),
    })
    return {
        charactersFor,
        contextFor,
        requestAttack: (
            actor: GameCharacter,
            now = Date.now(),
            targetId?: string,
            target?: WorldCombatTarget
        ): void =>
            publish(
                attackRoomCharacter(
                    actor,
                    charactersFor(actor),
                    world().get(actor.locationId),
                    now,
                    targetId,
                    target,
                    graves
                )
            ),
        requestAbility: (
            actor: GameCharacter,
            message: AbilityClientMessage,
            now: number
        ): GameEventPayload[] => {
            cancelCharacterControl(actor)
            return handleAbilityCommand(actor, message, contextFor(actor, now))
        },
    }
}
