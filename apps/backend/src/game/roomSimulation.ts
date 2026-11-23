import type { GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { advanceCharacterControl } from './characterControl'
import { resolvePendingAttackHit } from './combat'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { recordMovementNoise } from './hearing'
import { advanceMagicChannel } from './magicAbilities'
import { magicChannelFor } from './magicState'
import { advanceCharacter } from './movement'
import { observeNecromancerScene } from './necromancerTactics'
import type { PartyService } from './parties'
import { validatePrayerChannel } from './prayer'
import { trackRoadPrayerRecovery } from './roadPrayerRecovery'
import type { GameRoom } from './room'
import { resourceOccupants } from './roomEconomy'
import type { RoomLife } from './roomLife'
import { type RoomSocket, send, sendSnapshot } from './roomMessaging'
import { characterMovementIntent, travelRoomCharacter } from './roomTravel'
import { socketViewport } from './roomViewport'
import { advanceSavvaTerritory, SAVVA_ID } from './savvaTerritory'
import { practiceStealthMovement } from './stealthPractice'
import type { TheftService } from './theft'
import { projectViewport } from './viewportProjection'
import { pauseWorkerActivity } from './workerActivityState'
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
    advanceControllers(context, reacting, conversations)
    const roadRecovery = trackRoadPrayerRecovery(characters.values(), onEvents)
    for (const character of characters.values()) {
        advanceWorldCharacter(
            character,
            context,
            roadRecovery?.observe(character)
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
    for (const character of characters.values()) {
        resolveWorldAttack(character, context)
    }
    context.onEvents(room.advanceMagicProjectiles(now))
    context.life.advance(now, (actor, at) => room.abilityContextFor(actor, at))
    room.refreshPrayerAuraEnvironment()
    context.world.updateChestViews(characters, now)
    context.onEvents(context.parties.update(characters.values(), now))
    for (const [ws, id] of context.connections) {
        if (id === undefined) {
            continue
        }
        const locationId = characters.get(id)?.locationId
        const viewport = socketViewport(ws, id, locationId)
        sendSnapshot(ws, () =>
            projectViewport(context.snapshot(now, locationId, id), viewport, id)
        )
    }
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

function advanceControllers(
    context: SimulationContext,
    reacting: ReadonlySet<string>,
    conversations: ReadonlySet<string>
): void {
    const { characters, controllers, room, now } = context
    for (const [id, controller] of controllers) {
        const character = characters.get(id)
        if (character === undefined) {
            room.scenarios.defer(id, now)
            continue
        }
        if (context.companions.prepareSafety(character, room, now)) {
            room.scenarios.defer(id, now)
            continue
        }
        if (room.social.exchanges.isPaused(id)) {
            pauseWorkerActivity(character, 'exchange', now)
            room.scenarios.defer(id, now)
            continue
        }
        if (reacting.has(id)) {
            pauseWorkerActivity(character, 'reaction', now)
            room.scenarios.defer(id, now)
            continue
        }
        if (context.companions.blocksScenario(character, now, room)) {
            pauseWorkerActivity(character, 'control', now)
            room.scenarios.defer(id, now)
            advanceCharacterControl(character, room, now)
            continue
        }
        if (
            room.scenarios.advance(character, room, now, conversations.has(id))
        ) {
            pauseWorkerActivity(character, 'scenario', now)
            continue
        }
        if (conversations.has(id)) {
            pauseWorkerActivity(character, 'conversation', now)
            continue
        }
        if (advanceCharacterControl(character, room, now)) {
            pauseWorkerActivity(character, 'control', now)
            continue
        }
        if (room.social.society.controlsVisit(character)) {
            pauseWorkerActivity(character, 'conversation', now)
            continue
        }
        room.scenarios.advancePolicy(character, controller, room, now)
    }
}

function advanceWorldCharacter(
    character: GameCharacter,
    context: SimulationContext,
    onEnergyRegen?: Parameters<typeof advanceCharacter>[0]['onEnergyRegen']
): void {
    const { now, deltaMs, world, onEvents } = context
    const intent = characterMovementIntent(character, now, deltaMs)
    const before = { ...character.position }
    const navigation = world.get(character.locationId).navigation
    const event = advanceCharacter({
        character,
        deltaMs,
        now,
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

function sendTravelNotice(
    character: GameCharacter,
    notice: string,
    context: SimulationContext
): void {
    for (const [ws, id] of context.connections) {
        if (id === character.id) {
            send(ws, {
                type: 'event',
                serverTime: context.now,
                event: { kind: 'notice', actorId: id, text: notice },
            })
        }
    }
}

function resolveWorldAttack(
    character: GameCharacter,
    context: SimulationContext
): void {
    const { characters, world, now, onEvents } = context
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
