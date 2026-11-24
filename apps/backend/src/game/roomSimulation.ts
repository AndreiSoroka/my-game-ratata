import type { GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { resolvePendingAttackHit } from './combat'
import { takeSparkInterruptions } from './combatInterruption'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { recordMovementNoise, recordProjectileNoise } from './hearing'
import { idleSideStep } from './idleNpcSpacing'
import { advanceMagicChannel } from './magicAbilities'
import { magicChannelFor } from './magicState'
import { advanceCharacter } from './movement'
import { observeNecromancerScene } from './necromancerTactics'
import type { PartyService } from './parties'
import { validatePrayerChannel } from './prayer'
import { trackRoadPrayerRecovery } from './roadPrayerRecovery'
import type { GameRoom } from './room'
import { advanceControllers } from './roomControllers'
import { resourceOccupants } from './roomEconomy'
import type { RoomLife } from './roomLife'
import type { RoomSocket } from './roomMessaging'
import { publishRoomSnapshots } from './roomSnapshotPublication'
import { prepareRoomStopCorrections } from './roomStopCorrections'
import {
    characterMovementIntent,
    sendTravelNotice,
    travelRoomCharacter,
} from './roomTravel'
import { advanceSavvaTerritory, SAVVA_ID } from './savvaTerritory'
import { practiceStealthMovement } from './stealthPractice'
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'

export interface SimulationContext {
    companions: CompanionService
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    controllers: Map<string, CharacterController>
    deltaMs: number
    nicknames: Map<string, string>
    life: RoomLife
    now: number
    observeAttackResolution?:
        | ((
              actor: GameCharacter,
              actionId: string,
              events: readonly GameEventPayload[]
          ) => void)
        | undefined
    onEvents: (events: GameEventPayload[]) => void
    parties: PartyService
    theft: TheftService
    room: GameRoom
    snapshot: (
        now: number,
        locationId: string | undefined,
        playerId: string | undefined
    ) => WorldSnapshot
    world: WorldLocations
}

export function advanceRoomSimulation(context: SimulationContext): void {
    const { characters, room, now, onEvents } = context
    const stops = prepareRoomStopCorrections(context)
    room.social.update(now, characters.values())
    room.refreshPrayerAuraEnvironment()
    context.world.portals.expire(now)
    context.parties.update(characters.values(), now)
    room.workerRequests.reconcile(characters, now)
    room.adventureForWorkers().update(
        now,
        (id) => context.world.get(id).navigation,
        characters.values(),
        (id) => resourceOccupants(context.world, id)
    )
    for (const character of characters.values()) {
        context.companions.hasActiveLease(character, now, room)
    }
    const reacting = context.theft.update(room, characters.values(), now)
    room.scenarios.reconcile(characters, now)
    advanceSavvaTerritory(room, now)
    const conversations = reconcileRoomConversations(context, reacting)
    room.social.society.prepareMeetings(
        now,
        (actor) =>
            reacting.has(actor.id) ||
            conversations.has(actor.id) ||
            room.scenarios.busy(actor.id) ||
            room.social.exchanges.isPaused(actor.id) ||
            context.companions.blocksScenario(actor, now, room)
    )
    for (const character of characters.values()) {
        if (magicChannelFor(character) !== undefined) {
            const abilityContext = room.abilityContextFor(character, now)
            context.onEvents(advanceMagicChannel(character, abilityContext))
        }
    }
    const yielding = advanceControllers(context, reacting, conversations)
    stops?.observeCombat()
    const roadRecovery = trackRoadPrayerRecovery(characters.values(), onEvents)
    const motionDeadlines = new Map<string, number>()
    for (const character of characters.values()) {
        advanceWorldCharacter(
            character,
            context,
            yielding,
            roadRecovery?.observe(character),
            ({ continuationUntil }) => {
                if (continuationUntil !== undefined) {
                    motionDeadlines.set(character.id, continuationUntil)
                }
            }
        )
    }
    for (const character of characters.values()) {
        context.onEvents(
            validatePrayerChannel(
                character,
                now,
                room.abilityContextFor(character, now)
            )
        )
    }
    roadRecovery?.apply(
        (locationId) => context.world.get(locationId).navigation,
        now,
        context.deltaMs
    )
    resolveWorldCombat(context)
    context.life.advance(now, (actor, at) => room.abilityContextFor(actor, at))
    stops?.apply()
    room.refreshPrayerAuraEnvironment()
    context.world.updateChestViews(characters, now)
    context.onEvents(context.parties.update(characters.values(), now))
    publishRoomSnapshots(context, motionDeadlines)
}

function reconcileRoomConversations(
    { room, now, characters }: SimulationContext,
    reacting: ReadonlySet<string>
) {
    return room.adventureForWorkers().reconcileConversations(
        characters.values(),
        (actor) => room.navigationFor(actor),
        (actor) =>
            reacting.has(actor.id) ||
            (actor.id === SAVVA_ID
                ? observeNecromancerScene(actor, room, now).threat !== undefined
                : room.findVisibleTarget(actor, 240, now) !== undefined)
    )
}

function advanceWorldCharacter(
    character: GameCharacter,
    context: SimulationContext,
    yielding: ReadonlySet<string>,
    onEnergyRegen?: Parameters<typeof advanceCharacter>[0]['onEnergyRegen'],
    onMotionResolved?: Parameters<
        typeof advanceCharacter
    >[0]['onMotionResolved']
): void {
    const { now, deltaMs, world, onEvents } = context
    const intent = characterMovementIntent(character, now, deltaMs)
    const before = { ...character.position }
    const navigation = world.get(character.locationId).navigation
    const idleDestination = yielding.has(character.id)
        ? idleSideStep(
              character,
              context.room.charactersFor(character),
              yielding,
              navigation,
              now
          )
        : undefined
    const event = advanceCharacter({
        character,
        deltaMs,
        now,
        ...(idleDestination === undefined ? {} : { idleDestination }),
        ...(onMotionResolved === undefined ? {} : { onMotionResolved }),
        navigation,
        onEvents,
        ...(onEnergyRegen === undefined ? {} : { onEnergyRegen }),
        onNoise: (noise) =>
            recordMovementNoise(
                context.room,
                noise,
                context.characters.values()
            ),
    })
    if (event !== undefined) {
        onEvents([event])
    }
    onEvents(
        practiceStealthMovement(
            character,
            before,
            context.characters.values(),
            navigation,
            now
        )
    )
    const notice = travelRoomCharacter(
        character,
        intent,
        world,
        context.characters,
        now
    )
    if (notice !== undefined) {
        sendTravelNotice(character, notice, context)
    }
}

function resolveWorldCombat(context: SimulationContext): void {
    const { characters, room, now, onEvents } = context
    for (const character of characters.values()) {
        resolveWorldAttack(character, context)
    }
    onEvents(
        room.advanceMagicProjectiles(now, (actor, origin) =>
            recordProjectileNoise(room, actor, origin, now)
        )
    )
    const interruptions = takeSparkInterruptions(characters.values())
    if (interruptions.length > 0) {
        onEvents(interruptions)
    }
}

function resolveWorldAttack(
    character: GameCharacter,
    context: SimulationContext
): void {
    const { characters, room, world, now, onEvents } = context
    const pending = character.pendingAttack
    const location = world.get(character.locationId)
    const targets = [...characters.values()].filter(
        (target) =>
            target.locationId === character.locationId &&
            !target.tags.has('offline')
    )
    const hitEvents = resolvePendingAttackHit({
        actor: character,
        graves: context.life.graveRules,
        now,
        respawnDelayMsFor: resolveRespawnDelayMs,
        targets,
        navigation: location.navigation,
        tileSize: location.navigation.grid.tileWidth,
    })
    const released = hitEvents.find(
        (event) => event.kind === 'attack' && event.phase === 'completed'
    )?.projectile
    if (released !== undefined) {
        recordProjectileNoise(room, character, released.origin, now)
    }
    if (
        pending?.actionId !== undefined &&
        character.pendingAttack !== pending
    ) {
        context.observeAttackResolution?.(
            character,
            pending.actionId,
            hitEvents
        )
    }
    const lootEvents = location.inventory.dropLootForDeaths(hitEvents, (id) =>
        characters.get(id)
    )
    onEvents([...hitEvents, ...lootEvents])
}

export function resolveRespawnDelayMs(target: GameCharacter): number {
    return target.controllerKind === 'network_player' ? 5000 : 15000
}
