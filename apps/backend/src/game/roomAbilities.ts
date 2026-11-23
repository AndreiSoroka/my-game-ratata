import type {
    AbilityClientMessage,
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from './abilityCommands'
import {
    type AbilityContext,
    abilityNotice,
    authoredAbilityNotice,
} from './abilityContext'
import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { hasCharacterRoute } from './characterRoute'
import { attemptAbilityAttack } from './combat'
import { effectiveAbility } from './effectiveParameters'
import { MagicCombat } from './magicCombat'
import { bindMagicCombat } from './magicState'
import type { NavigationService } from './navigation'
import { bindPrayerAuraEnvironment } from './prayerAuraEnvironment'
import { rememberPursuitPortal } from './pursuitTravel'
import { attackRoomCharacter } from './roomCombat'
import { resolveRespawnDelayMs } from './roomSimulation'
import type { WorldLocations } from './worldLocations'

interface RoomAbilityOptions {
    useAshRite?: NonNullable<AbilityContext['useAshRite']>
    graves: NonNullable<AbilityContext['graves']>
    sameParty: NonNullable<AbilityContext['sameParty']>
    exchangePaused: (actorId: string) => boolean
    closeConversations: (actorId: string) => void
    now?: () => number
}

export function createRoomCombatActions(
    world: () => WorldLocations,
    characters: () => Map<string, GameCharacter>,
    publish: (events: GameEventPayload[]) => void,
    options: RoomAbilityOptions
) {
    const { graves, sameParty } = options
    const magic = new MagicCombat()
    const { canOpenPortal, openPortal, ...portalActions } = roomPortalActions(
        world,
        characters,
        options
    )
    const navigationFor = (actor: Pick<GameCharacter, 'locationId'>) =>
        world().get(actor.locationId).navigation
    const charactersIn = (locationId: string) =>
        [...characters().values()].filter(
            (target) => target.locationId === locationId
        )
    const charactersFor = (actor: GameCharacter) =>
        charactersIn(actor.locationId)
    const requestAbilityAttack = roomAbilityAttack(
        charactersFor,
        navigationFor,
        graves
    )
    const contextFor = (actor: GameCharacter, now: number): AbilityContext => ({
        graves,
        magic,
        sameParty,
        characters: charactersFor(actor),
        navigation: navigationFor(actor),
        now,
        canOpenPortal,
        openPortal,
        requestAbilityAttack,
        useAshRite: options.useAshRite,
    })
    return {
        ...portalActions,
        ...roomMagicEnvironment(
            world,
            characters,
            options,
            magic,
            charactersIn
        ),
        navigationFor,
        charactersFor,
        contextFor,
        requestAttack: (
            actor: GameCharacter,
            now = (options.now ?? Date.now)(),
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
            if (!canShootAlongRoute(actor, message)) {
                cancelCharacterControl(actor)
            }
            return handleAbilityCommand(actor, message, contextFor(actor, now))
        },
    }
}

function canShootAlongRoute(
    actor: GameCharacter,
    message: AbilityClientMessage
): boolean {
    return (
        message.type === 'use_ability' &&
        message.abilityId === 'shot' &&
        hasCharacterRoute(actor) &&
        effectiveAbility(actor, 'shot').movementMs === 0
    )
}

function roomAbilityAttack(
    charactersFor: (actor: GameCharacter) => GameCharacter[],
    navigationFor: (actor: GameCharacter) => NavigationService,
    graves: RoomAbilityOptions['graves']
): NonNullable<AbilityContext['requestAbilityAttack']> {
    return (actor, targetId, abilityId, now, target) => {
        const navigation = navigationFor(actor)
        return attemptAbilityAttack(
            {
                actor,
                targetId,
                target,
                graves,
                targets: charactersFor(actor),
                navigation,
                tileSize: navigation.grid.tileWidth,
                now,
                respawnDelayMsFor: resolveRespawnDelayMs,
            },
            abilityId
        )
    }
}

function roomPortalActions(
    world: () => WorldLocations,
    characters: () => ReadonlyMap<string, GameCharacter>,
    options: RoomAbilityOptions
) {
    return {
        canOpenPortal: (actor: GameCharacter, now: number) =>
            world().portals.canOpen(actor, now),
        openPortal: (actor: GameCharacter, now: number) => {
            const passage = world().portals.open(actor, now)
            return passage === undefined
                ? undefined
                : abilityNotice(
                      actor,
                      `Портал открыт: ${passage.source.destinationName}.`
                  )
        },
        portalPassageFor: (
            actor: GameCharacter,
            endpointId: string,
            now: number
        ) => world().portals.passage(endpointId, actor.locationId, now),
        requestPortalUse: (
            actor: GameCharacter,
            endpointId: string,
            now: number
        ) => {
            if (options.exchangePaused(actor.id)) {
                return []
            }
            const locations = world()
            const notice = locations.usePortal(
                actor,
                endpointId,
                now,
                (passage) =>
                    rememberPursuitPortal(
                        actor,
                        passage,
                        characters().values(),
                        locations.get(actor.locationId).navigation,
                        now
                    )
            )
            if (notice === undefined) {
                return authoredAbilityNotice(actor, 'combat.portalUnavailable')
            }
            options.closeConversations(actor.id)
            return abilityNotice(actor, notice)
        },
    }
}

function roomMagicEnvironment(
    world: () => WorldLocations,
    characters: () => ReadonlyMap<string, GameCharacter>,
    { graves, sameParty }: RoomAbilityOptions,
    magic: MagicCombat,
    charactersIn: (locationId: string) => GameCharacter[]
) {
    const prayerAuras = {
        characters: () => characters().values(),
        navigationFor: (locationId: string) =>
            world().get(locationId).navigation,
        sameParty,
    }
    return {
        bindActors: () => {
            bindPrayerAuraEnvironment(characters().values(), prayerAuras)
            bindMagicCombat(magic, characters().values())
        },
        magicEffectsFor: (locationId: string, now: number) =>
            magic.effectsFor(locationId, now),
        advanceMagicProjectiles: (now: number) =>
            magic.advance(now, (locationId) => ({
                characters: charactersIn(locationId),
                graves,
                navigation: world().get(locationId).navigation,
                now,
                respawnDelayMsFor: resolveRespawnDelayMs,
            })),
    }
}
