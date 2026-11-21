import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import NearbyActionMenu from './NearbyActionMenu.vue'
import NearbyInteraction from './NearbyInteraction.vue'

function resident(id: string, y: number): CharacterSnapshot {
    return characterFixture(id, {
        nickname: `Житель ${id}`,
        controllerKind: 'scripted',
        position: { x: 0, y },
        soul: {
            kind: 'spark',
            controlSource: 'script',
            canSpeak: true,
            personality: '',
            companion: null,
        },
    })
}
function interaction(
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    snapshot = worldFixture([player, ...characters])
) {
    return mount(NearbyInteraction, {
        props: { snapshot, player, characters, blocked: false },
        attachTo: document.body,
    })
}

describe('opening a one-target interaction', () => {
    it.each([false, true])(
        'stops held input and cancels only an existing path (path: %s)',
        async (hasPath) => {
            const player = characterFixture('self', { path: hasPath ? [{ x: 0, y: 32 }] : [] })
            const wrapper = interaction(player, [resident('first', 20)])
            try {
                wrapper.vm.openMenu()
                await flushPromises()
                const expected = [{ type: 'move_input', axis: { x: 0, y: 0 } }]
                expect(wrapper.emitted('command')).toEqual([
                    ...(hasPath ? [[{ type: 'move_to', target: { x: 0, y: 0 } }]] : []),
                    expected,
                ])
                expect(wrapper.get('h2').text()).toBe('Житель first')
            } finally {
                wrapper.unmount()
            }
        }
    )
    it('names one target and keeps its actions when a different resident becomes closer', async () => {
        const player = characterFixture('self')
        const first = resident('first', 20)
        const second = resident('second', 40)
        const wrapper = interaction(player, [first, second])
        try {
            expect(wrapper.vm.prompt).toContain(`F ${first.nickname} · `)
            wrapper.vm.openMenu()
            await flushPromises()
            expect(wrapper.vm.prompt).toBeUndefined()
            expect(wrapper.get('h2').text()).toBe(first.nickname)
            const closer = { ...second, position: { x: 0, y: 10 } }
            await wrapper.setProps({
                snapshot: worldFixture([player, first, closer]),
                characters: [first, closer],
            })
            expect(wrapper.vm.prompt).toBeUndefined()
            expect(wrapper.get('h2').text()).toBe(first.nickname)
            expect(wrapper.find('[data-action-id="talk:second"]').exists()).toBe(false)
            await wrapper
                .get('[data-action-id="talk:first"]')
                .trigger('keydown', { code: 'KeyF', key: 'а' })
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'interact', targetId: first.id },
            ])
        } finally {
            wrapper.unmount()
        }
    })
})

describe('interaction menu invalidation', () => {
    it.each(['removed', 'dead', 'far', 'hidden', 'behind'] as const)(
        'closes when its target is %s and never executes a neighbor through stale selection',
        async (change) => {
            const player = characterFixture('self')
            const first = resident('first', 20)
            const second = resident('second', 40)
            const wrapper = interaction(player, [first, second])
            try {
                wrapper.vm.openMenu()
                await flushPromises()
                const changed = {
                    ...first,
                    alive: change !== 'dead',
                    position: { x: 0, y: change === 'far' ? 70 : change === 'behind' ? -20 : 20 },
                }
                const characters = change === 'removed' ? [second] : [changed, second]
                await wrapper.setProps({
                    characters,
                    snapshot: worldFixture([player, ...characters]),
                    isPositionVisible: (position) => change !== 'hidden' || position.y !== 20,
                })
                expect(wrapper.find('[role="menu"]').exists()).toBe(false)
                expect(wrapper.vm.prompt).toContain(`F ${second.nickname} · `)
                wrapper.getComponent(NearbyActionMenu).vm.$emit('select', 'talk:second')
                await flushPromises()
                expect(wrapper.emitted('command')).toHaveLength(1)
            } finally {
                wrapper.unmount()
            }
        }
    )
    it.each(['blocked', 'death', 'travel'] as const)(
        'closes on %s without forwarding the old selection',
        async (change) => {
            const player = characterFixture('self')
            const first = resident('first', 20)
            const wrapper = interaction(player, [first])
            try {
                wrapper.vm.openMenu()
                await flushPromises()
                if (change === 'blocked') await wrapper.setProps({ blocked: true })
                else if (change === 'death')
                    await wrapper.setProps({ player: { ...player, alive: false } })
                else {
                    const location: NonNullable<WorldSnapshot['location']> = {
                        id: 'map-1-2',
                        name: 'Новая локация',
                        column: 1,
                        row: 2,
                        columns: 5,
                        rows: 5,
                        biome: 'outskirts',
                        dangerLevel: 1,
                        regionName: 'Земли Новогорода',
                        map: {
                            asset: { url: '/game/map/map1.json', revision: 'fixture' },
                            id: 'map-1-2',
                            width: 96,
                            height: 80,
                            tileWidth: 16,
                            tileHeight: 16,
                            worldWidth: 1536,
                            worldHeight: 1280,
                            solidLayerNames: [],
                        },
                    }
                    await wrapper.setProps({
                        snapshot: { ...worldFixture([player, first]), location },
                    })
                }
                expect(wrapper.find('[role="menu"]').exists()).toBe(false)
                expect(Boolean(wrapper.vm.prompt)).toBe(change === 'travel')
                wrapper.getComponent(NearbyActionMenu).vm.$emit('select', 'talk:first')
                expect(wrapper.emitted('command')).toHaveLength(1)
            } finally {
                wrapper.unmount()
            }
        }
    )
})

describe('world item and farm interaction', () => {
    it('acts on the explicitly selected item behind the hero and never falls back from an unavailable target', async () => {
        const player = characterFixture('self')
        const snapshot = {
            ...worldFixture([player]),
            items: [
                { id: 'front', itemId: 'food' as const, position: { x: 0, y: 16 } },
                { id: 'selected', itemId: 'simple_sword' as const, position: { x: 0, y: -8 } },
            ],
        }
        const wrapper = interaction(player, [], snapshot)
        try {
            await wrapper.setProps({ selectedKey: 'item:selected' })
            wrapper.vm.openMenu()
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'pickup_item', worldItemId: 'selected' },
            ])
            expect(wrapper.emitted('targetChange')?.at(-1)).toEqual([undefined])
            const count = wrapper.emitted('command')?.length
            await wrapper.setProps({ selectedKey: 'item:missing' })
            wrapper.vm.openMenu()
            expect(wrapper.emitted('command')).toHaveLength(count!)
            await wrapper.setProps({ selectedKey: 'item:front', canSelectTarget: () => false })
            wrapper.vm.openMenu()
            expect(wrapper.emitted('command')).toHaveLength(count!)
        } finally {
            wrapper.unmount()
        }
    })
    it('executes a single item action immediately with the chosen world instance ID', () => {
        const player = characterFixture('self')
        const snapshot = worldFixture([player])
        snapshot.items = [
            { id: 'front-food', itemId: 'food', position: { x: 0, y: 16 } },
            { id: 'behind-sword', itemId: 'simple_sword', position: { x: 0, y: -8 } },
        ]
        const wrapper = interaction(player, [], snapshot)
        try {
            wrapper.vm.openMenu()
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'pickup_item', worldItemId: 'front-food' },
            ])
            expect(wrapper.find('[role="menu"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps a disabled farm action inert and closes when the plot changes meaning', async () => {
        const player = characterFixture('self')
        const snapshot = { ...worldFixture([player]), adventure: adventureFixture() }
        snapshot.adventure.farmPlots = [
            {
                id: 'wheat',
                name: 'Пшеница',
                crop: 'wheat',
                locationId: 'map-1-2',
                position: { x: 0, y: 20 },
                phase: 'growing',
                readyAt: 120_000,
            },
        ]
        const wrapper = interaction(player, [], snapshot)
        try {
            wrapper.vm.openMenu()
            await flushPromises()
            expect(wrapper.get('[role="menuitem"]').attributes('disabled')).toBeDefined()
            await wrapper.get('[role="menu"]').trigger('keydown', { code: 'KeyF', key: 'а' })
            expect(wrapper.emitted('command')).toHaveLength(1)
            const ripe = {
                ...snapshot,
                adventure: {
                    ...snapshot.adventure,
                    farmPlots: snapshot.adventure.farmPlots.map((plot) => ({
                        ...plot,
                        phase: 'ripe' as const,
                    })),
                },
            }
            await wrapper.setProps({ snapshot: ripe })
            expect(wrapper.find('[role="menu"]').exists()).toBe(false)
            expect(wrapper.emitted('command')).toHaveLength(1)
            wrapper.vm.openMenu()
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'farm_action', plotId: 'wheat', action: 'harvest' },
            ])
        } finally {
            wrapper.unmount()
        }
    })
})

describe('interaction highlight follows the actual F target', () => {
    it('forwards exact pond geometry from the received snapshot to the actual canvas highlight event', async () => {
        const player = characterFixture('self', { position: { x: 40, y: 88 }, facing: 'right' })
        const pond = {
            id: 'pond',
            kind: 'water' as const,
            name: 'Пруд',
            depleted: false,
            position: { x: 112, y: 112 },
            bounds: { x: 64, y: 64, width: 96, height: 96 },
            interactionAreas: [
                { x: 64, y: 64, width: 16, height: 96 },
                { x: 80, y: 144, width: 80, height: 16 },
            ],
        }
        const snapshot = {
            ...worldFixture([player]),
            adventure: { ...adventureFixture(), worldObjects: [pond] },
        }
        const wrapper = interaction(player, [], snapshot)
        try {
            const highlight = {
                key: 'world:pond',
                position: pond.position,
                bounds: pond.bounds,
                interactionAreas: pond.interactionAreas,
            }
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject(highlight)
            await wrapper.setProps({
                player: { ...player, position: { x: 184, y: 152 }, facing: 'left' },
            })
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject(highlight)
            wrapper.vm.openMenu()
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'world_interact', objectId: pond.id },
            ])
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps the highlighted target pinned with its menu and clears it behind another window', async () => {
        const player = characterFixture('self')
        const first = resident('first', 20)
        const second = resident('second', 40)
        const wrapper = interaction(player, [first, second])
        try {
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject({
                key: 'character:first',
                kind: 'character',
                position: first.position,
            })
            wrapper.vm.openMenu()
            await flushPromises()
            const closer = { ...second, position: { x: 0, y: 10 } }
            await wrapper.setProps({
                snapshot: worldFixture([player, first, closer]),
                characters: [first, closer],
            })
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject({
                key: 'character:first',
            })
            await wrapper.setProps({ blocked: true })
            expect(wrapper.emitted('targetChange')?.at(-1)).toEqual([undefined])
        } finally {
            wrapper.unmount()
        }
    })
    it('clears the highlight when turning away and when the component leaves the scene', async () => {
        const player = characterFixture('self')
        const first = resident('first', 20)
        const wrapper = interaction(player, [first])
        try {
            await wrapper.setProps({ player: { ...player, facing: 'up' } })
            expect(wrapper.emitted('targetChange')?.at(-1)).toEqual([undefined])
            await wrapper.setProps({ player })
            expect(wrapper.emitted('targetChange')?.at(-1)?.[0]).toMatchObject({
                key: 'character:first',
            })
        } finally {
            wrapper.unmount()
        }
        expect(wrapper.emitted('targetChange')?.at(-1)).toEqual([undefined])
    })
})
