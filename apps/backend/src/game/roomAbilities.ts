import type {
    AbilityClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from './abilityCommands'
import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { attemptAbilityAttack } from './combat'
import { attackRoomCharacter } from './roomCombat'
import { resolveRespawnDelayMs } from './roomSimulation'
import type { WorldLocations } from './worldLocations'
export function createRoomCombatActions(
    world: () => WorldLocations,
    characters: () => Map<string, GameCharacter>,
    publish: (events: GameEventPayload[]) => void
) {
    const charactersFor = (actor: GameCharacter) =>
        [...characters().values()].filter(
            (target) => target.locationId === actor.locationId
        )
    const contextFor = (actor: GameCharacter, now: number): AbilityContext => ({
        characters: charactersFor(actor),
        navigation: world().get(actor.locationId).navigation,
        now,
        requestAbilityAttack: (attacker, targetId, abilityId, time) =>
            attemptAbilityAttack(
                {
                    actor: attacker,
                    targetId,
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
            targetId?: string
        ): void =>
            publish(
                attackRoomCharacter(
                    actor,
                    charactersFor(actor),
                    world().get(actor.locationId),
                    now,
                    targetId
                )
            ),
        requestAbility: (
            actor: GameCharacter,
            message: AbilityClientMessage,
            now: number
        ): GameEventPayload[] => {
            return handleAbilityCommand(actor, message, contextFor(actor, now))
        },
    }
}
