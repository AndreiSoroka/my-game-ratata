import type {
    CompanionRequest,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import {
    applyAgentDecision,
    type CompanionWorld,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { PolicyController } from '../src/game/companionControllers'
import { companionSoul } from '../src/game/companionProfiles'
import { CompanionService } from '../src/game/companions'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { WorldLocations } from '../src/game/worldLocations'

describe('companion consent and speech', () => {
    it('lets the princess decide after an introduction and refuse combat', () => {
        const service = new CompanionService()
        const actor = hero('hero')
        const princess = npc('npc_princess_1')
        request(service, actor, princess, 'follow')
        expect(princess.soul.companion?.leaderId).toBeNull()
        const first = request(service, actor, princess, 'talk')
        const second = request(service, actor, princess, 'talk')
        expect(first[0]?.text).not.toContain('Помню тебя')
        expect(second[0]?.text).toContain('Помню тебя')
        request(service, actor, princess, 'follow')
        expect(princess.soul.companion).toMatchObject({
            canFight: false,
            leaderId: actor.id,
            order: 'follow',
        })
        request(service, actor, princess, 'help')
        expect(princess.soul.companion?.order).toBe('follow')
        expect(princess.soul.companion?.lastReply).toContain(
            'не стану сражаться'
        )
    })

    it('keeps ownership independent from other players and allows the owner to dismiss', () => {
        const service = new CompanionService()
        const actor = hero('hero')
        const stranger = hero('stranger')
        const veteran = npc('npc_veteran_1')
        request(service, actor, veteran, 'follow')
        request(service, stranger, veteran, 'follow')
        request(service, stranger, veteran, 'dismiss')
        expect(veteran.soul.companion?.leaderId).toBe(actor.id)
        request(service, actor, veteran, 'dismiss')
        expect(veteran.soul.companion).toMatchObject({
            leaderId: null,
            order: 'idle',
        })
    })

    it('separates speech from species and from human/model/script control', () => {
        const service = new CompanionService()
        const actor = hero('hero')
        const ordinary = new GameCharacter({
            archetype: 'slime',
            controllerKind: 'mob1',
            faction: 'peaceful',
            id: 'ordinary',
            nickname: 'Slime',
            spawnPosition: actor.position,
        })
        const enchanted = npc('npc_magic_slime_1', 'slime')
        expect(ordinary.soul).toMatchObject({
            canSpeak: false,
            controlSource: 'script',
            kind: 'echo',
        })
        expect(
            request(service, actor, ordinary, 'talk').some(
                (event) => event.kind === 'chat'
            )
        ).toBe(false)
        expect(
            request(service, actor, enchanted, 'talk').some(
                (event) => event.kind === 'chat'
            )
        ).toBe(true)
        expect(enchanted.soul).toMatchObject({
            canSpeak: true,
            controlSource: 'script',
            kind: 'echo',
        })
    })

    it.each([
        'far',
        'different-location',
        'dead-actor',
        'dead-npc',
        'offline',
    ] as const)('rejects unavailable or remote requests: %s', (reason) => {
        const service = new CompanionService()
        const actor = hero('hero')
        const veteran = npc('npc_veteran_1')
        if (reason === 'far') {
            veteran.position.x += 65
        }
        if (reason === 'different-location') {
            veteran.locationId = 'map-0-0'
        }
        if (reason === 'dead-actor') {
            actor.alive = false
        }
        if (reason === 'dead-npc') {
            veteran.alive = false
        }
        if (reason === 'offline') {
            actor.tags.add('offline')
        }
        const events = request(service, actor, veteran, 'follow')
        expect(events[0]?.kind).toBe('notice')
        expect(veteran.soul.companion?.leaderId ?? null).toBeNull()
    })
})

describe('shared companion movement and combat', () => {
    it('keeps the guard at her post and lets nearby enemies take real delayed damage', () => {
        const service = new CompanionService()
        const actor = hero('hero')
        const guard = npc('npc_guard_1')
        const target = monster()
        request(service, actor, guard, 'follow')
        expect(guard.soul.companion?.leaderId).toBeNull()
        request(service, actor, guard, 'help')
        const context = worldFor([actor, guard, target], target)
        const start = { ...guard.position }
        service.update(guard, context.world, 5_000)
        expect(guard.soul.companion?.order).toBe('idle')
        expect(guard.soul.companion?.leaderId).toBeNull()
        expect(target.hp).toBe(target.maxHp)
        advanceCharacter({
            character: guard,
            deltaMs: 50,
            navigation: context.navigation,
            now: 5_050,
        })
        const events = resolvePendingAttackHit(
            attackContext(guard, target, 5_050)
        )
        expect(events.some((event) => event.kind === 'damage')).toBe(true)
        expect(guard.position).toEqual(start)
    })

    it('lets the veteran attack via the common combat service while the princess only follows', () => {
        const service = new CompanionService()
        const actor = hero('hero')
        const veteran = npc('npc_veteran_1')
        const princess = npc('npc_princess_1')
        const target = monster()
        request(service, actor, veteran, 'help')
        request(service, actor, princess, 'talk')
        request(service, actor, princess, 'follow')
        actor.position.x += 70
        const context = worldFor([actor, veteran, princess, target], target)
        service.update(veteran, context.world, 5_000)
        service.update(princess, context.world, 5_000)
        expect(veteran.pendingAttack).toBeDefined()
        expect(princess.pendingAttack).toBeUndefined()
        expect(princess.hasPath()).toBe(true)
        expect(context.attacks).toHaveBeenCalledTimes(1)
        expect(
            resolvePendingAttackHit(attackContext(veteran, target, 5_050)).some(
                (event) => event.kind === 'damage'
            )
        ).toBe(true)
    })

    it.each(['dead', 'offline', 'missing'] as const)(
        'releases a companion when its leader is %s',
        (reason) => {
            const service = new CompanionService()
            const actor = hero('hero')
            const veteran = npc('npc_veteran_1')
            request(service, actor, veteran, 'follow')
            if (reason === 'dead') {
                actor.alive = false
            }
            if (reason === 'offline') {
                actor.tags.add('offline')
            }
            const context = worldFor(
                reason === 'missing' ? [veteran] : [actor, veteran]
            )
            service.update(veteran, context.world, 5_000)
            expect(veteran.soul.companion).toMatchObject({
                leaderId: null,
                order: 'idle',
            })
            expect(veteran.hasPath()).toBe(false)
        }
    )
})

describe('companion border following', () => {
    it('releases a dead NPC and gives a new identity a fresh introduction', () => {
        const service = new CompanionService()
        const actor = hero('first')
        const princess = npc('npc_princess_1')
        request(service, actor, princess, 'talk')
        request(service, actor, princess, 'follow')
        princess.alive = false
        const context = worldFor([actor, princess])
        expect(service.update(princess, context.world, 5_000)).toEqual([])
        expect(princess.soul.companion?.leaderId).toBeNull()
        princess.alive = true
        const replacement = hero('new-id')
        expect(
            request(service, replacement, princess, 'talk')[0]?.text
        ).not.toContain('Помню тебя')
    })

    it.each([
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
    ])(
        'follows across ordinary borders without service teleportation: %j',
        (direction) => {
            const service = new CompanionService()
            const actor = hero('hero')
            const princess = npc('npc_princess_1')
            request(service, actor, princess, 'talk')
            request(service, actor, princess, 'follow')
            const locations = new WorldLocations(openNavigation())
            const navigation = locations.get().navigation
            const center = locations.get().description
            princess.position = {
                x: direction.x === 0 ? 168 : direction.x < 0 ? 40 : 280,
                y: direction.y === 0 ? 168 : direction.y < 0 ? 40 : 280,
            }
            actor.locationId = `map-${String(center.column + direction.x)}-${String(center.row + direction.y)}`
            actor.position = {
                x: direction.x === 0 ? 168 : direction.x > 0 ? 40 : 280,
                y: direction.y === 0 ? 168 : direction.y > 0 ? 40 : 280,
            }
            const context = worldFor([actor, princess])
            context.world.navigationFor = (character) =>
                locations.get(character.locationId).navigation
            const before = { ...princess.position }
            service.update(princess, context.world, 5_000)
            expect(princess.position).toEqual(before)
            for (
                let now = 5_000;
                now < 10_000 && princess.locationId !== actor.locationId;
                now += 50
            ) {
                service.update(princess, context.world, now)
                const point = princess.nextPathPoint()
                const input = princess.getMoveInput()
                const intent =
                    point === undefined || input.x !== 0 || input.y !== 0
                        ? input
                        : {
                              x: point.x - princess.position.x,
                              y: point.y - princess.position.y,
                          }
                advanceCharacter({
                    character: princess,
                    deltaMs: 50,
                    navigation,
                    now,
                })
                locations.travel(princess, intent)
            }
            expect(princess.locationId).toBe(actor.locationId)
            expect(princess.soul.companion?.leaderId).toBe(actor.id)
        }
    )
})

describe('validated external agent adapter', () => {
    it('leases control for five seconds without fallback overrides and releases on wait', () => {
        const service = new CompanionService()
        const slime = new GameCharacter({
            archetype: 'slime',
            controllerKind: 'mob1',
            id: 'echo',
            nickname: 'Echo',
            spawnPosition: { x: 80, y: 80 },
        })
        const context = worldFor([slime])
        const fallback = { update: vi.fn() }
        const controller = new PolicyController(service, fallback)
        expect(
            service.decide(
                slime,
                { axis: { x: 1, y: 0 }, type: 'move' },
                context.world,
                5_000
            ).accepted
        ).toBe(true)
        controller.update(slime, context.world as GameRoom, 5_050)
        expect(fallback.update).not.toHaveBeenCalled()
        expect(slime.getMoveInput()).toEqual({ x: 1, y: 0 })
        expect(slime.soul.controlSource).toBe('model')
        expect(slime.soul.kind).toBe('spark')
        controller.update(slime, context.world as GameRoom, 10_000)
        expect(fallback.update).toHaveBeenCalledTimes(1)
        expect(slime.soul.controlSource).toBe('script')
        expect(slime.soul.kind).toBe('echo')
        service.decide(
            slime,
            { axis: { x: -1, y: 0 }, type: 'move' },
            context.world,
            11_000
        )
        service.decide(slime, { type: 'wait' }, context.world, 11_050)
        expect(service.hasActiveLease(slime, 11_100)).toBe(false)
        expect(slime.getMoveInput()).toEqual({ x: 0, y: 0 })
    })

    it('rejects invalid vectors, unavailable bodies, human takeover, speech and friendly or remote attacks', () => {
        const actor = npc('npc_veteran_1')
        const player = hero('hero')
        const target = monster()
        const context = worldFor([actor, target, player])
        for (const decision of [
            { axis: { x: NaN, y: 0 }, type: 'move' },
            { axis: { x: 2, y: 0 }, type: 'move' },
            { target: { x: 999, y: 0 }, type: 'move_to' },
        ]) {
            expect(
                applyAgentDecision(actor, decision, context.world, 5_000)
                    .accepted
            ).toBe(false)
        }
        expect(
            applyAgentDecision(player, { type: 'wait' }, context.world, 5_000)
                .accepted
        ).toBe(false)
        expect(
            applyAgentDecision(
                actor,
                { targetId: player.id, type: 'attack' },
                context.world,
                5_000
            ).accepted
        ).toBe(false)
        target.locationId = 'map-0-0'
        expect(
            applyAgentDecision(
                actor,
                { targetId: target.id, type: 'attack' },
                context.world,
                5_000
            ).accepted
        ).toBe(false)
        actor.alive = false
        expect(
            applyAgentDecision(
                actor,
                { type: 'speak', text: 'Hello' },
                context.world,
                5_000
            ).accepted
        ).toBe(false)
        const silent = new GameCharacter({
            archetype: 'slime',
            controllerKind: 'mob1',
            id: 'silent',
            nickname: 'Silent',
            spawnPosition: { x: 80, y: 80 },
        })
        expect(
            applyAgentDecision(
                silent,
                { type: 'speak', text: 'Hello' },
                context.world,
                5_000
            ).accepted
        ).toBe(false)
        const princess = npc('npc_princess_1')
        target.locationId = princess.locationId
        expect(
            applyAgentDecision(
                princess,
                { targetId: target.id, type: 'attack' },
                context.world,
                5_000
            ).accepted
        ).toBe(false)
        expect(context.attacks).not.toHaveBeenCalled()
    })
})

function hero(id: string): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind: 'network_player',
        id,
        nickname: id,
        spawnPosition: { x: 80, y: 80 },
    })
}

function npc(
    id: string,
    archetype: GameCharacter['archetype'] = 'human'
): GameCharacter {
    return new GameCharacter({
        archetype,
        controllerKind: 'scripted',
        faction: 'peaceful',
        id,
        nickname: id,
        soul: companionSoul(id),
        spawnPosition: { x: 80, y: 80 },
    })
}

function monster(): GameCharacter {
    return new GameCharacter({
        archetype: 'slime',
        controllerKind: 'mob1',
        id: 'enemy',
        nickname: 'Enemy',
        spawnPosition: { x: 80, y: 88 },
    })
}

function request(
    service: CompanionService,
    actor: GameCharacter,
    target: GameCharacter,
    action: CompanionRequest
): GameEventPayload[] {
    return service.handle(
        actor,
        { request: action, targetId: target.id, type: 'companion_request' },
        [actor, target],
        5_000
    )
}

function openNavigation(): NavigationService {
    return new NavigationService({
        height: 20,
        id: 'open',
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
        tileHeight: 16,
        tileWidth: 16,
        width: 20,
    })
}

function worldFor(
    characters: GameCharacter[],
    visible?: GameCharacter
): {
    world: CompanionWorld
    navigation: NavigationService
    attacks: ReturnType<typeof vi.fn>
} {
    const navigation = openNavigation()
    const attacks = vi.fn((actor: GameCharacter, now?: number) => {
        attemptAttack({
            actor,
            now: now ?? 5_000,
            respawnDelayMsFor: () => 1_000,
            targets: characters,
            tileSize: 16,
        })
    })
    return {
        navigation,
        attacks,
        world: {
            findVisibleTarget: () => visible,
            getCharacter: (id) =>
                characters.find((character) => character.id === id),
            navigationFor: () => navigation,
            requestAttack: attacks,
        },
    }
}

function attackContext(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
) {
    return {
        actor,
        now,
        respawnDelayMsFor: () => 1_000,
        targets: [actor, target],
        tileSize: 16,
    }
}
