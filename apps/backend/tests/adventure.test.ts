import type {
    AdventureResourceNode,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { createItemInstance, inventoryCapacity } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'

describe('adventure quest and dialogue', () => {
    it('credits only the final attacker and deduplicates death events', () => {
        const service = new AdventureService()
        const player = character('hero')
        const other = character('other')
        const mira = character('npc_friendly_girl_1', 'mob1')
        acceptQuest(service, player, mira)
        acceptQuest(service, other, mira)
        const slime = defeatedSlime('slime', player.locationId)
        const find = finder(player, other, slime)
        const event: GameEventPayload = {
            actorId: other.id,
            kind: 'death',
            targetId: slime.id,
        }

        service.observe([event, event], find)

        expect(
            service.snapshot(player.id, player.locationId, player).quest.kills
        ).toBe(0)
        expect(
            service.snapshot(other.id, other.locationId, other).quest.kills
        ).toBe(1)
        expect(
            service.snapshot(other.id, other.locationId, other).trophies
        ).toBe(0)
    })

    it('keeps global quest progress across locations and rewards turn-in once', () => {
        const service = new AdventureService()
        const player = character('hero')
        const mira = character('npc_friendly_girl_1', 'mob1')
        acceptQuest(service, player, mira)

        for (let index = 0; index < 3; index += 1) {
            player.locationId = `map-${String(index)}-0`
            recordKill(service, player, `slime-${String(index)}`, true)
        }

        expect(
            service.snapshot(player.id, player.locationId, player).quest.status
        ).toBe('ready')
        expect(
            service.snapshot(player.id, player.locationId, player).trophies
        ).toBe(3)
        player.locationId = mira.locationId
        service.interact(player, mira.id, [mira])
        service.choose(player, 'turn_in_trophies', [mira])
        service.choose(player, 'turn_in_trophies', [mira])

        expect(
            service.snapshot(player.id, player.locationId, player)
        ).toMatchObject({
            gold: 40,
            quest: { status: 'completed' },
            trophies: 0,
        })
        service.choose(player, 'restore_ward', [mira])
        expect(
            service.snapshot(player.id, player.locationId, player).wardRestored
        ).toBe(true)
    })

    it('ignores unearned, friendly, living, and cross-location kills', () => {
        const service = new AdventureService()
        const player = character('hero')
        const mira = character('npc_friendly_girl_1', 'mob1')
        recordKill(service, player, 'before-quest')
        acceptQuest(service, player, mira)
        const wrongLocation = defeatedSlime('far', 'map-0-0')
        const friendly = defeatedSlime('friend', player.locationId)
        Object.assign(friendly, { faction: 'peaceful' })
        const living = defeatedSlime('living', player.locationId)
        living.alive = true

        for (const target of [wrongLocation, friendly, living]) {
            service.observe(
                [{ actorId: player.id, kind: 'death', targetId: target.id }],
                finder(player, target)
            )
        }

        expect(
            service.snapshot(player.id, player.locationId, player).quest.kills
        ).toBe(0)
    })

    it('requires a nearby living real NPC for interaction and stale choices', () => {
        const service = new AdventureService()
        const player = character('hero')
        const mira = character('npc_friendly_girl_1', 'mob1')
        service.interact(player, mira.id, [])
        expect(
            service.snapshot(player.id, player.locationId, player).dialogue
        ).toBeNull()
        mira.position.x = player.position.x + 49
        service.interact(player, mira.id, [mira])
        expect(
            service.snapshot(player.id, player.locationId, player).dialogue
        ).toBeNull()
        mira.position.x = player.position.x
        service.interact(player, mira.id, [mira])
        player.locationId = 'map-0-0'
        service.choose(player, 'accept_quest', [mira])
        expect(
            service.snapshot(player.id, player.locationId, player).quest.status
        ).toBe('available')
        player.locationId = mira.locationId
        mira.alive = false
        service.choose(player, 'accept_quest', [mira])
        expect(
            service.snapshot(player.id, player.locationId, player).quest.status
        ).toBe('available')
    })
})

describe('adventure trade and identity', () => {
    it('starts with zero gold and uses authoritative prices and inventory capacity', () => {
        const { service, player, mira } = rewardedHero()
        service.trade(player, 'simple_sword', [mira])
        expect(player.inventory.map((item) => item.itemId)).toEqual([
            'simple_sword',
        ])
        expect(
            service.snapshot(player.id, player.locationId, player).gold
        ).toBe(15)
        service.trade(player, 'boots', [mira])
        expect(
            service.snapshot(player.id, player.locationId, player).gold
        ).toBe(15)
        player.inventory = Array.from({ length: inventoryCapacity }, () =>
            createItemInstance('food')
        )
        service.trade(player, 'food', [mira])
        expect(
            service.snapshot(player.id, player.locationId, player).gold
        ).toBe(15)
    })

    it('blocks trading after leaving, changing location, dying, or losing the merchant', () => {
        const { service, player, mira } = rewardedHero()
        for (const invalidState of ['far', 'location', 'dead', 'missing']) {
            player.position.x = invalidState === 'far' ? 200 : 80
            player.locationId =
                invalidState === 'location' ? 'map-0-0' : mira.locationId
            player.alive = invalidState !== 'dead'
            service.trade(
                player,
                'food',
                invalidState === 'missing' ? [] : [mira]
            )
            expect(player.inventory).toHaveLength(0)
            expect(
                service.snapshot(player.id, player.locationId, player).gold
            ).toBe(40)
        }
    })

    it('preserves progress while revivable and forgets a permanently dead identity', () => {
        const { service, player, mira } = rewardedHero()
        service.observe(
            [{ actorId: 'enemy', kind: 'death', targetId: player.id }],
            finder(player)
        )
        expect(
            service.snapshot(player.id, player.locationId, player).gold
        ).toBe(40)
        service.observe(
            [{ actorId: player.id, kind: 'permadeath' }],
            finder(player)
        )
        expect(
            service.snapshot(player.id, player.locationId, player)
        ).toMatchObject({
            gold: 0,
            quest: { status: 'available' },
            trophies: 0,
            wardRestored: false,
        })
        const nextHero = character('new-identity')
        service.interact(nextHero, mira.id, [mira])
        expect(service.snapshot(nextHero.id).dialogue?.text).toContain('Я Мира')
        expect(service.snapshot(nextHero.id).gold).toBe(0)
    })
})

describe('adventure gathering and crafting', () => {
    it('enforces shared depletion, cooldown, location, and proximity', () => {
        let now = 1_000
        const node = resourceNode('herbs', 2)
        const service = new AdventureService({
            now: () => now,
            resourceNodes: [node],
        })
        const player = character('hero')
        gather(service, player, node.id)
        gather(service, player, node.id)
        expect(
            service.snapshot(player.id, player.locationId, player).materials
                .herbs
        ).toBe(1)
        now += 800
        player.position.x += 49
        gather(service, player, node.id)
        player.position.x -= 49
        player.locationId = 'map-0-0'
        gather(service, player, node.id)
        expect(
            service.snapshot(player.id, player.locationId, player).materials
                .herbs
        ).toBe(1)
        player.locationId = node.locationId
        gather(service, player, node.id)
        now += 800
        gather(service, player, node.id)
        expect(
            service.snapshot(player.id, player.locationId, player).materials
                .herbs
        ).toBe(2)
        expect(
            service.snapshot(player.id, player.locationId, player)
                .resourceNodes[0]?.remaining
        ).toBe(0)
    })

    it('consumes real materials once and creates existing inventory items', () => {
        let now = 0
        const nodes = [
            resourceNode('herbs', 3),
            resourceNode('fiber', 3),
            resourceNode('scrap', 3),
            resourceNode('wood', 2),
        ]
        const service = new AdventureService({
            now: () => now,
            resourceNodes: nodes,
        })
        const player = character('hero')

        for (const node of nodes) {
            for (let unit = 0; unit < node.remaining; unit += 1) {
                gather(service, player, node.id)
                now += 800
            }
        }

        for (const recipeId of ['food', 'boots', 'simple_sword'] as const) {
            service.handle(player, { recipeId, type: 'craft' }, [])
            service.handle(player, { recipeId, type: 'craft' }, [])
        }

        expect(player.inventory.map((item) => item.itemId)).toEqual([
            'food',
            'boots',
            'simple_sword',
        ])
        expect(
            service.snapshot(player.id, player.locationId, player).materials
        ).toEqual({
            fiber: 0,
            grain: 0,
            herbs: 0,
            scrap: 0,
            wood: 0,
            stone: 0,
            brushwood: 0,
            sapling: 0,
        })
        expect(
            service.snapshot(player.id, player.locationId, player).gold
        ).toBe(0)
    })

    it('keeps materials when the inventory is full and clears them on permanent death', () => {
        let now = 0
        const node = resourceNode('herbs', 6)
        const service = new AdventureService({
            now: () => now,
            resourceNodes: [node],
        })
        const player = character('hero')
        for (let index = 0; index < 6; index += 1) {
            gather(service, player, node.id)
            now += 800
        }
        player.inventory.push(
            ...Array.from({ length: inventoryCapacity - 1 }, () =>
                createItemInstance('food')
            )
        )
        service.handle(player, { recipeId: 'food', type: 'craft' }, [])
        expect(
            service.snapshot(player.id, player.locationId, player).materials
                .herbs
        ).toBe(6)
        service.observe([retireCharacter(player)], finder(player))
        expect(
            service.snapshot(player.id, player.locationId, player).materials
                .herbs
        ).toBe(0)
    })
})

function character(
    id: string,
    controllerKind: GameCharacter['controllerKind'] = 'network_player'
): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        id,
        nickname: id,
        spawnPosition: { x: 80, y: 80 },
    })
}

function defeatedSlime(id: string, locationId: string): GameCharacter {
    const slime = new GameCharacter({
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        id,
        locationId,
        nickname: id,
        spawnPosition: { x: 80, y: 80 },
    })
    slime.applyDamage(slime.maxHp, 5_000)
    slime.queueRespawn(5_000, 15_000)
    return slime
}

function finder(
    ...characters: GameCharacter[]
): (id: string) => GameCharacter | undefined {
    return (id) => characters.find((candidate) => candidate.id === id)
}

function acceptQuest(
    service: AdventureService,
    player: GameCharacter,
    mira: GameCharacter
): void {
    expect(service.snapshot(player.id, player.locationId, player).gold).toBe(0)
    service.interact(player, mira.id, [mira])
    service.choose(player, 'accept_quest', [mira])
}

function recordKill(
    service: AdventureService,
    player: GameCharacter,
    targetId: string,
    collect = false
): void {
    const target = defeatedSlime(targetId, player.locationId)
    const events: GameEventPayload[] = [
        { actorId: player.id, kind: 'death', targetId },
    ]
    service.observe(events, finder(player, target))
    if (collect) {
        const inventory = new WorldInventory(
            new NavigationService({
                id: player.locationId,
                width: 20,
                height: 20,
                tileWidth: 16,
                tileHeight: 16,
                solid: Array<boolean>(400).fill(false),
                solidLayerNames: [],
            })
        )
        inventory.dropLootForDeaths(events, finder(player, target))
        const corpse = inventory
            .snapshotChests()
            .find((entry) => entry.kind === 'corpse')
        if (corpse === undefined) {
            throw new Error('Expected trophy corpse')
        }
        inventory.openChestById(player, corpse.id)
        inventory.containers.handle(player, {
            type: 'take_all_chest_items',
            chestId: corpse.id,
        })
    }
}

function rewardedHero(): {
    service: AdventureService
    player: GameCharacter
    mira: GameCharacter
} {
    const service = new AdventureService()
    const player = character('hero')
    const mira = character('npc_friendly_girl_1', 'mob1')
    acceptQuest(service, player, mira)
    for (let index = 0; index < 3; index += 1) {
        recordKill(service, player, `slime-${String(index)}`, true)
    }
    service.choose(player, 'turn_in_trophies', [mira])
    return { mira, player, service }
}

function resourceNode(
    kind: AdventureResourceNode['kind'],
    remaining: number
): AdventureResourceNode {
    return {
        id: kind,
        kind,
        locationId: CENTER_LOCATION_ID,
        position: { x: 80, y: 80 },
        remaining,
    }
}

function gather(
    service: AdventureService,
    player: GameCharacter,
    nodeId: string
): void {
    service.handle(player, { nodeId, type: 'gather' }, [])
}
