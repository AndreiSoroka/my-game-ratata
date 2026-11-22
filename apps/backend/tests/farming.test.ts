import {
    CENTER_LOCATION_ID,
    FARM_GROW_MS,
    FARM_PLOTS,
    type FarmAction,
    type FarmPlotDefinition,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { isAdventureCommand } from '../src/game/extraCommands'
import {
    countInventoryItem,
    createItemInstance,
    inventoryCapacity,
} from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { resourceChecks } from '../src/game/resourceObservation'

function plotAt(index: number): FarmPlotDefinition {
    const plot = FARM_PLOTS[index]
    if (plot === undefined) {
        throw new Error('Missing farm definition')
    }
    return plot
}

function farmer(
    id: string,
    plot: FarmPlotDefinition,
    controllerKind: GameCharacter['controllerKind'] = 'network_player'
): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        spawnPosition: plot.position,
        locationId: plot.locationId,
    })
}

function fixture(farmRandom: () => number = () => 0) {
    const clock = { now: 1_000 }
    const ripe = plotAt(0)
    const bare = plotAt(1)
    const service = new AdventureService({
        now: () => clock.now,
        farmRandom,
    })
    return { clock, ripe, bare, service, actor: farmer('hero', bare) }
}

function act(
    service: AdventureService,
    actor: GameCharacter,
    plot: FarmPlotDefinition,
    action: FarmAction
) {
    return service.handle(
        actor,
        { type: 'farm_action', plotId: plot.id, action },
        []
    )
}

function state(service: AdventureService, actor: GameCharacter) {
    return service.snapshot(actor.id, actor.locationId, actor)
}

describe('shared communal farms', () => {
    it('starts with one ripe bed per outskirts, and snapshots are local detached data', () => {
        const { service, actor, ripe } = fixture()
        expect(FARM_PLOTS).toHaveLength(12)
        const locations = new Set(FARM_PLOTS.map((plot) => plot.locationId))
        expect(locations.size).toBe(4)
        for (const locationId of locations) {
            const plots = service.snapshot(actor.id, locationId).farmPlots
            expect(plots).toHaveLength(3)
            expect(plots.filter((plot) => plot.phase === 'ripe')).toHaveLength(
                1
            )
            expect(plots.filter((plot) => plot.phase === 'bare')).toHaveLength(
                2
            )
            expect(plots.every((plot) => plot.locationId === locationId)).toBe(
                true
            )
        }
        expect(
            service.snapshot(actor.id, CENTER_LOCATION_ID).farmPlots
        ).toEqual([])
        const detached = state(service, actor).farmPlots[0]
        if (detached === undefined) {
            throw new Error('Missing plot snapshot')
        }
        detached.phase = 'bare'
        detached.position.x = -1
        expect(state(service, actor).farmPlots[0]).toMatchObject({
            phase: 'ripe',
            position: ripe.position,
        })
    })

    it('awards a shared ripe harvest once when two players race and replay', () => {
        const { service, clock, ripe } = fixture()
        const first = farmer('first', ripe)
        const second = farmer('second', ripe)
        expect(act(service, first, ripe, 'harvest')).toEqual([
            {
                actorId: first.id,
                plotId: ripe.id,
                kind: 'farm_harvest',
                amount: 3,
            },
        ])
        expect(act(service, second, ripe, 'harvest')).toEqual([])
        clock.now += 800
        expect(act(service, first, ripe, 'harvest')).toEqual([])
        expect(state(service, first).materials.grain).toBe(3)
        expect(state(service, second).materials.grain).toBe(0)
        expect(state(service, second).farmPlots[0]?.phase).toBe('bare')
        const latecomer = farmer('new-identity', ripe)
        expect(act(service, latecomer, ripe, 'harvest')).toEqual([])
        expect(ripe.initiallyRipe).toBe(true)
    })

    it.each(['network_player', 'scripted'] as const)(
        'uses the same paid 45-second growth cycle for %s controllers',
        (controllerKind) => {
            const { service, clock, bare } = fixture()
            const actor = farmer(controllerKind, bare, controllerKind)
            actor.inventory.push(createItemInstance('wheat_seed', 2))
            const energy = actor.energy
            expect(act(service, actor, bare, 'sow')).toEqual([
                {
                    actorId: actor.id,
                    plotId: bare.id,
                    kind: 'farm_sow',
                },
            ])
            const readyAt = clock.now + FARM_GROW_MS
            expect(state(service, actor).farmPlots[1]).toMatchObject({
                phase: 'growing',
                readyAt,
            })
            expect(actor.energy).toBe(energy - 5)
            expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(1)
            act(service, actor, bare, 'sow')
            clock.now += 800
            act(service, actor, bare, 'sow')
            act(service, actor, bare, 'harvest')
            expect(actor.energy).toBe(energy - 5)
            expect(state(service, actor).materials.grain).toBe(0)
            clock.now = readyAt - 1
            expect(state(service, actor).farmPlots[1]?.phase).toBe('growing')
            expect(act(service, actor, bare, 'harvest')).toEqual([])
            clock.now = readyAt
            expect(state(service, actor).farmPlots[1]?.phase).toBe('ripe')
            act(service, actor, bare, 'harvest')
            expect(state(service, actor).materials.grain).toBe(3)
            expect(state(service, actor).farmPlots[1]).toMatchObject({
                phase: 'bare',
                readyAt: 0,
            })
            clock.now += 800
            act(service, actor, bare, 'sow')
            expect(actor.energy).toBe(energy - 10)
            expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(0)
            expect(state(service, actor).farmPlots[1]?.readyAt).toBe(
                clock.now + FARM_GROW_MS
            )
        }
    )
})

it('uses the same discounted sowing cost for the private hint and actual payment', () => {
    const { service, actor, bare } = fixture()
    actor.inventory.push(createItemInstance('wheat_seed'))
    actor.energy = 4.5
    expect(resourceChecks(actor).sow).toBe('energy')
    expect(act(service, actor, bare, 'sow')).toEqual([])
    expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(1)

    actor.progression.constellations.opened.add('life.work')
    expect(resourceChecks(actor)).toMatchObject({
        sow: 'ready',
        sowEnergyCost: 4.5,
    })
    expect(act(service, actor, bare, 'sow')[0]?.kind).toBe('farm_sow')
    expect(actor.energy).toBe(0)
    expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(0)
})

describe('farm work validation', () => {
    it.each([
        [
            'dead',
            (actor: GameCharacter) => {
                actor.alive = false
            },
        ],
        [
            'offline',
            (actor: GameCharacter) => {
                actor.tags.add('offline')
            },
        ],
        [
            'remote',
            (actor: GameCharacter) => {
                actor.position.x += 49
            },
        ],
        [
            'another location',
            (actor: GameCharacter) => {
                actor.locationId = CENTER_LOCATION_ID
            },
        ],
        [
            'stunned',
            (actor: GameCharacter) => {
                actor.stunUntil = 2_000
            },
        ],
        [
            'action locked',
            (actor: GameCharacter) => {
                actor.lockAction(1_000, 500)
            },
        ],
    ] as const)(
        'rejects %s actors without changing plots or materials',
        (_, invalidate) => {
            const { service, bare, ripe } = fixture()
            for (const [plot, action] of [
                [bare, 'sow'],
                [ripe, 'harvest'],
            ] as const) {
                const actor = farmer(action, plot)
                actor.inventory.push(createItemInstance('wheat_seed'))
                const energy = actor.energy
                invalidate(actor)
                expect(act(service, actor, plot, action)).toEqual([])
                expect(actor.energy).toBe(energy)
                expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(
                    1
                )
                expect(state(service, actor).materials.grain).toBe(0)
            }
            expect(
                service
                    .snapshot('observer', bare.locationId)
                    .farmPlots.map((plot) => plot.phase)
            ).toEqual(['ripe', 'bare', 'bare'])
        }
    )

    it('requires real labor, validates unknown plots, and includes the exact 48px reach boundary', () => {
        const { service, actor, bare } = fixture()
        actor.inventory.push(createItemInstance('wheat_seed'))
        actor.energy = 4
        expect(act(service, actor, bare, 'sow')).toEqual([])
        expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(1)
        actor.energy = 5
        expect(act(service, actor, { ...bare, id: 'invented' }, 'sow')).toEqual(
            []
        )
        actor.position.x += 48
        expect(act(service, actor, bare, 'sow')).toHaveLength(1)
        expect(actor.energy).toBe(0)
        expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(0)
    })

    it('shares the labor cooldown with gathering and prevents instant harvest after sowing elsewhere', () => {
        const { clock, bare, ripe, actor } = fixture()
        actor.inventory.push(createItemInstance('wheat_seed'))
        const service = new AdventureService({
            now: () => clock.now,
            farmRandom: () => 0,
            resourceNodes: [
                {
                    id: 'herbs',
                    locationId: bare.locationId,
                    position: bare.position,
                    kind: 'herbs',
                    remaining: 1,
                },
            ],
        })
        service.handle(actor, { type: 'gather', nodeId: 'herbs' }, [])
        expect(act(service, actor, bare, 'sow')).toEqual([])
        clock.now += 800
        expect(act(service, actor, bare, 'sow')).toHaveLength(1)
        actor.position = { ...ripe.position }
        expect(act(service, actor, ripe, 'harvest')).toEqual([])
        clock.now += 800
        expect(act(service, actor, ripe, 'harvest')).toHaveLength(1)
    })
})

describe('sowing seed costs', () => {
    it.each(['network_player', 'scripted'] as const)(
        'requires an actual carried seed rather than grain for %s controllers',
        (controllerKind) => {
            const { service, bare } = fixture()
            const actor = farmer(controllerKind, bare, controllerKind)
            actor.inventory.push(createItemInstance('grain', 3))
            const energy = actor.energy
            expect(act(service, actor, bare, 'sow')).toEqual([])
            expect(actor.energy).toBe(energy)
            expect(countInventoryItem(actor.inventory, 'grain')).toBe(3)
            expect(state(service, actor).farmPlots[1]?.phase).toBe('bare')
            expect(state(service, actor).notice).toContain('1 семя пшеницы')
            actor.inventory.push(createItemInstance('wheat_seed'))
            expect(act(service, actor, bare, 'sow')).toHaveLength(1)
            expect(actor.energy).toBe(energy - 5)
            expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(0)
        }
    )

    it('does not consume another seed when two actors race to sow the same bed', () => {
        const { service, bare } = fixture()
        const first = farmer('first', bare)
        const second = farmer('second', bare)
        first.inventory.push(createItemInstance('wheat_seed'))
        second.inventory.push(createItemInstance('wheat_seed'))
        const energy = second.energy
        expect(act(service, first, bare, 'sow')).toHaveLength(1)
        expect(act(service, second, bare, 'sow')).toEqual([])
        expect(countInventoryItem(first.inventory, 'wheat_seed')).toBe(0)
        expect(countInventoryItem(second.inventory, 'wheat_seed')).toBe(1)
        expect(second.energy).toBe(energy)
    })
})

describe('frozen harvest seed drops', () => {
    it.each([
        [0, 0],
        [0.499_999, 0],
        [0.5, 1],
        [0.799_999, 1],
        [0.8, 2],
        [0.949_999, 2],
        [0.95, 3],
        [0.999_999, 3],
    ])(
        'resolves random roll %s to %s seeds alongside three grain',
        (roll, seeds) => {
            const { service, ripe } = fixture(() => roll)
            const actor = farmer('harvester', ripe)
            expect(act(service, actor, ripe, 'harvest')).toHaveLength(1)
            expect(countInventoryItem(actor.inventory, 'grain')).toBe(3)
            expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(
                seeds
            )
        }
    )

    it('keeps the complete hidden yield through snapshots, full-bag failures and another harvester', () => {
        const farmRandom = vi.fn(() => 0.99)
        const { service, ripe, actor } = fixture(farmRandom)
        actor.position = { ...ripe.position }
        actor.inventory.push(
            createItemInstance('grain', 6),
            ...Array.from({ length: inventoryCapacity - 1 }, () =>
                createItemInstance('food')
            )
        )
        const rolls = farmRandom.mock.calls.length
        const inventory = structuredClone(actor.inventory)
        farmRandom.mockReturnValue(0)
        expect(state(service, actor).farmPlots[0]).toEqual({
            id: ripe.id,
            locationId: ripe.locationId,
            position: ripe.position,
            crop: ripe.crop,
            name: ripe.name,
            phase: 'ripe',
            readyAt: 0,
        })
        expect(act(service, actor, ripe, 'harvest')).toEqual([])
        expect(act(service, actor, ripe, 'harvest')).toEqual([])
        expect(actor.inventory).toEqual(inventory)
        expect(state(service, actor).farmPlots[0]?.phase).toBe('ripe')
        const second = farmer('second', ripe)
        expect(act(service, second, ripe, 'harvest')).toHaveLength(1)
        expect(countInventoryItem(second.inventory, 'grain')).toBe(3)
        expect(countInventoryItem(second.inventory, 'wheat_seed')).toBe(3)
        expect(farmRandom).toHaveBeenCalledTimes(rolls)
        expect(act(service, actor, ripe, 'harvest')).toEqual([])
    })

    it('rolls again only for a successful new sow, never for rejected work or snapshot reads', () => {
        const farmRandom = vi.fn(() => 0)
        const { service, bare, clock, actor } = fixture(farmRandom)
        const initialRolls = farmRandom.mock.calls.length
        expect(act(service, actor, bare, 'sow')).toEqual([])
        expect(act(service, actor, bare, 'harvest')).toEqual([])
        state(service, actor)
        expect(farmRandom).toHaveBeenCalledTimes(initialRolls)
        actor.inventory.push(createItemInstance('wheat_seed', 2))
        farmRandom.mockReturnValue(0.8)
        expect(act(service, actor, bare, 'sow')).toHaveLength(1)
        expect(farmRandom).toHaveBeenCalledTimes(initialRolls + 1)
        expect(act(service, actor, bare, 'sow')).toEqual([])
        farmRandom.mockReturnValue(0)
        clock.now += FARM_GROW_MS
        expect(act(service, actor, bare, 'harvest')).toHaveLength(1)
        expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(3)
        expect(farmRandom).toHaveBeenCalledTimes(initialRolls + 1)
        clock.now += 800
        expect(act(service, actor, bare, 'sow')).toHaveLength(1)
        expect(farmRandom).toHaveBeenCalledTimes(initialRolls + 2)
    })
})

describe('grain and bread', () => {
    it('consumes exactly three harvested grain per existing food item and blocks duplicate crafting', () => {
        const { service, ripe } = fixture()
        const actor = farmer('baker', ripe)
        act(service, actor, ripe, 'harvest')
        const recipe = state(service, actor).recipes.find(
            (candidate) => candidate.id === 'bake_bread'
        )
        expect(recipe).toMatchObject({ cost: { grain: 3 }, itemId: 'food' })
        expect(
            service.handle(actor, { type: 'craft', recipeId: 'bake_bread' }, [])
        ).toEqual([{ actorId: actor.id, itemId: 'food', kind: 'item_pickup' }])
        expect(state(service, actor).materials.grain).toBe(0)
        expect(
            service.handle(actor, { type: 'craft', recipeId: 'bake_bread' }, [])
        ).toEqual([])
        expect(actor.inventory.map((item) => item.itemId)).toEqual(['food'])
    })

    it('keeps bag grain on failed capacity or availability checks until identity retirement', () => {
        const { service, ripe, clock } = fixture()
        const actor = farmer('baker', ripe)
        act(service, actor, ripe, 'harvest')
        const otherPlot = plotAt(3)
        actor.locationId = otherPlot.locationId
        actor.position = { ...otherPlot.position }
        clock.now += 800
        act(service, actor, otherPlot, 'harvest')
        actor.inventory.push(
            ...Array.from({ length: inventoryCapacity - 1 }, () =>
                createItemInstance('food')
            )
        )
        service.handle(actor, { type: 'craft', recipeId: 'bake_bread' }, [])
        expect(state(service, actor).materials.grain).toBe(6)
        actor.inventory = actor.inventory.filter(
            (item) => item.itemId === 'grain'
        )
        actor.tags.add('offline')
        service.handle(actor, { type: 'craft', recipeId: 'bake_bread' }, [])
        actor.tags.delete('offline')
        actor.alive = false
        service.handle(actor, { type: 'craft', recipeId: 'bake_bread' }, [])
        expect(actor.inventory).toEqual([
            expect.objectContaining({ itemId: 'grain', quantity: 6 }),
        ])
        expect(state(service, actor).materials.grain).toBe(6)
        service.observe([retireCharacter(actor)], () => actor)
        expect(state(service, actor).materials.grain).toBe(0)
        expect(state(service, actor).farmPlots[0]?.phase).toBe('bare')
    })
})

describe('farm command boundary', () => {
    it('accepts only intentions and strips client-supplied reward and owner fields', () => {
        const message = {
            type: 'farm_action',
            plotId: plotAt(0).id,
            action: 'harvest',
        }
        const parsed = parseClientMessage(
            JSON.stringify({
                ...message,
                actorId: 'someone-else',
                amount: 1_000,
                readyAt: 0,
            })
        )
        expect(parsed).toEqual({ message })
        if (parsed.message === undefined) {
            throw new Error('Missing parsed farm intention')
        }
        expect(isAdventureCommand(parsed.message)).toBe(true)
        expect(
            parseClientMessage(
                JSON.stringify({ type: 'craft', recipeId: 'bake_bread' })
            ).message
        ).toEqual({ type: 'craft', recipeId: 'bake_bread' })
        expect(
            parseClientMessage(
                JSON.stringify({ type: 'trade', itemId: 'bake_bread' })
            ).error
        ).toBeDefined()
    })

    it.each([
        { plotId: '', action: 'sow' },
        { plotId: ' ', action: 'sow' },
        { plotId: 'x'.repeat(101), action: 'sow' },
        { plotId: 3, action: 'harvest' },
        { plotId: 'farm', action: 'grow' },
        { plotId: 'farm', action: undefined },
    ])('rejects malformed farm command $plotId/$action', (fields) => {
        const result = parseClientMessage(
            JSON.stringify({ type: 'farm_action', ...fields })
        )
        expect(result.error).toBeDefined()
        expect(result.message).toBeUndefined()
    })
})
