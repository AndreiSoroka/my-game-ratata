import {
    type AdventureResourceNode,
    type CharacterAutoAction,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    cancelCharacterControl,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import type { ControlWorld } from '../src/game/controlWorld'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { plantingPreview } from '../src/game/plantingPreview'

function fixture(remaining = 2, source: 'tree' | 'bush' | 'branches' = 'tree') {
    const node: AdventureResourceNode = {
        id: 'selected',
        source,
        phase: 'ready',
        remaining,
        treeSize: 'adult',
        kind: source === 'tree' ? 'wood' : 'brushwood',
        locationId: 'map-2-2',
        position: { x: 184, y: 184 },
        bounds: { x: 160, y: 160, width: 48, height: 32 },
        matureBounds: { x: 160, y: 160, width: 48, height: 32 },
        ...(source === 'tree'
            ? { collisionBounds: { x: 160, y: 160, width: 48, height: 32 } }
            : {}),
    }
    const actor = new GameCharacter({
        id: 'worker',
        nickname: 'Worker',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 184, y: 224 },
    })
    actor.equipment.weapon = createItemInstance('axe')
    const navigation = new NavigationService({
        id: 'map-2-2',
        width: 40,
        height: 40,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(1600).fill(false),
        plantable: Array<boolean>(1600).fill(true),
        solidLayerNames: [],
    })
    const service = new AdventureService({
        resourceNodes: [node],
        worldObjects: [],
        now: () => 0,
    })
    const world: ControlWorld = {
        getCharacter: () => undefined,
        navigationFor: () => navigation,
        adventureForWorkers: () => service,
        publishEvents: vi.fn(),
        requestAttack: vi.fn(),
    }
    service.update(0, () => navigation, [actor])
    const start = (
        action: CharacterAutoAction = { kind: 'gather', nodeId: node.id },
        now = 0
    ) => setCharacterControl(actor, { type: 'auto_action', action }, world, now)
    const tick = (now: number) => advanceCharacterControl(actor, world, now)
    const read = () =>
        service
            .resourceSnapshot(actor.locationId)
            .find((entry) => entry.id === node.id)
    return { actor, navigation, service, world, start, tick, read }
}

describe('forest automatic work through shared simulation', () => {
    it('gives the first strike immediately, respects the boundary and stops before the stump', () => {
        const f = fixture()
        expect(f.start()).toBe(true)
        f.tick(0)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
        f.tick(1999)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
        f.tick(2000)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
        expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(1)
        expect(f.read()?.phase).toBe('stump')
        expect(snapshotControl(f.actor).mode).toBe('none')
        f.tick(6000)
        expect(f.read()?.phase).toBe('stump')
    })
    it('releases the work movement lock on cancel without resetting cooldown', () => {
        const f = fixture(8)
        f.start()
        f.tick(0)
        expect(f.actor.isActionLocked(1)).toBe(true)
        cancelCharacterControl(f.actor)
        expect(f.actor.isActionLocked(1)).toBe(false)
        f.actor.setMoveInput({ x: 1, y: 0 })
        const x = f.actor.position.x
        advanceCharacter({
            character: f.actor,
            navigation: f.navigation,
            now: 10,
            deltaMs: 10,
        })
        expect(f.actor.position.x).toBeGreaterThan(x)
        expect(f.start(undefined, 100)).toBe(true)
        f.tick(100)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
        f.tick(2000)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
    })
    it.each([
        'damage',
        'equipment',
        'stun',
        'location',
        'offline',
        'death',
    ] as const)('interrupts on %s and never resumes', (reason) => {
        const f = fixture(8)
        f.start()
        f.tick(0)
        if (reason === 'damage') {
            f.actor.applyDamage(1, 100)
        }
        if (reason === 'equipment') {
            f.actor.equipment.weapon = createItemInstance('axe')
        }
        if (reason === 'stun') {
            f.actor.stunUntil = 5000
        }
        if (reason === 'location') {
            f.actor.locationId = 'map-2-1'
        }
        if (reason === 'offline') {
            f.actor.tags.add('offline')
        }
        if (reason === 'death') {
            f.actor.applyDamage(f.actor.hp, 100)
        }
        f.tick(100)
        expect(snapshotControl(f.actor).mode).toBe('none')
        expect(f.actor.isActionLocked(100)).toBe(false)
        f.actor.stunUntil = 0
        f.actor.tags.delete('offline')
        f.actor.locationId = 'map-2-2'
        f.tick(5000)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
    })
    it('does not treat ordinary tool wear as an equipment change', () => {
        const f = fixture(8)
        f.start()
        f.tick(0)
        f.tick(2000)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
        expect(snapshotControl(f.actor).mode).toBe('action')
    })
    it('approaches only the selected source using ordinary movement', () => {
        const f = fixture()
        f.actor.position = { x: 184, y: 320 }
        expect(f.start()).toBe(true)
        for (let now = 0; now <= 3000; now += 50) {
            f.tick(now)
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now,
                deltaMs: 50,
            })
        }
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBeGreaterThan(0)
        expect(f.actor.position.y).toBeLessThan(320)
    })
    it('rejects a full bag and stops on exhaustion without extra cost', () => {
        const f = fixture()
        f.actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('stone')
        )
        const energy = f.actor.energy
        expect(f.start()).toBe(false)
        expect(f.actor.energy).toBe(energy)
        expect(f.read()?.remaining).toBe(2)
        f.actor.inventory = []
        f.actor.energy = 5
        f.start()
        f.tick(0)
        f.tick(2000)
        expect(f.read()?.remaining).toBe(1)
        expect(snapshotControl(f.actor).mode).toBe('none')
    })
})

describe('planting previews and one-shot approach', () => {
    it('normalizes private previews and limits the sliding window to ten per second', () => {
        const f = fixture()
        for (let i = 0; i < 10; i++) {
            const answer = plantingPreview(
                f.actor,
                {
                    type: 'plant_tree_preview',
                    requestId: String(i),
                    position: { x: 315, y: 316 },
                },
                f.service,
                f.navigation,
                i
            )
            expect(answer?.requestId).toBe(String(i))
            expect(answer?.position).toEqual({ x: 312, y: 312 })
            expect(answer?.available).toBe(true)
        }
        expect(
            plantingPreview(
                f.actor,
                {
                    type: 'plant_tree_preview',
                    requestId: 'blocked',
                    position: { x: 312, y: 312 },
                },
                f.service,
                f.navigation,
                999
            )
        ).toBeUndefined()
        expect(
            plantingPreview(
                f.actor,
                {
                    type: 'plant_tree_preview',
                    requestId: 'next',
                    position: { x: 312, y: 312 },
                },
                f.service,
                f.navigation,
                1000
            )?.available
        ).toBe(true)
    })
})

describe('one-shot planting approach', () => {
    it('walks out of the future trunk and spends exactly once after arrival', () => {
        const f = fixture()
        f.actor.position = { x: 312, y: 312 }
        f.actor.inventory = [
            createItemInstance('sapling'),
            createItemInstance('sapling'),
        ]
        const energy = f.actor.energy
        const action = {
            kind: 'plant_tree',
            position: { x: 312, y: 312 },
        } as const
        expect(f.start(action)).toBe(true)
        // Repeated confirmation replaces the same unexecuted intention, never charges twice.
        expect(f.start(action)).toBe(true)
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
        for (let now = 0; now <= 2000; now += 50) {
            f.tick(now)
            if (
                f.service
                    .resourceSnapshot('map-2-2')
                    .some((node) => node.phase === 'growing')
            ) {
                break
            }
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now,
                deltaMs: 50,
            })
        }
        expect(
            f.service
                .resourceSnapshot('map-2-2')
                .filter((node) => node.phase === 'growing'),
            JSON.stringify({
                position: f.actor.position,
                control: snapshotControl(f.actor),
                notice: f.service.snapshot(
                    f.actor.id,
                    f.actor.locationId,
                    f.actor
                ).notice,
            })
        ).toHaveLength(1)
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(1)
        expect(f.actor.energy).toBe(energy - 5)
        expect(snapshotControl(f.actor).mode).toBe('none')
    })
    it('cancels a distant approach without costs and times out without progress', () => {
        const f = fixture()
        f.actor.inventory = [
            createItemInstance('sapling'),
            createItemInstance('sapling'),
        ]
        const action = {
            kind: 'plant_tree',
            position: { x: 440, y: 440 },
        } as const
        f.start(action)
        f.tick(0)
        expect(f.actor.hasPath()).toBe(true)
        cancelCharacterControl(f.actor)
        expect(f.actor.hasPath()).toBe(false)
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
        f.start(action)
        f.tick(0)
        f.tick(10_000)
        expect(snapshotControl(f.actor).mode).toBe('none')
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
    })
    it('rechecks a plot changed while walking and preserves the sapling', () => {
        const f = fixture()
        f.actor.inventory = [createItemInstance('sapling')]
        f.start({ kind: 'plant_tree', position: { x: 440, y: 440 } })
        f.tick(0)
        const other = new GameCharacter({
            id: 'other',
            nickname: 'Other',
            archetype: 'human',
            controllerKind: 'scripted',
            spawnPosition: { x: 440, y: 440 },
        })
        f.service.update(100, () => f.navigation, [f.actor, other])
        f.tick(100)
        expect(snapshotControl(f.actor).mode).toBe('none')
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(1)
    })
})
