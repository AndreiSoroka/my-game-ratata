import type { WorldChestSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import { graveActions } from './graveInteractions'
import NearbyActionMenu from './NearbyActionMenu.vue'
import NearbyInteraction from './NearbyInteraction.vue'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

function fixture() {
    const player = characterFixture('cleric', {
        heroClass: 'cleric',
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
    const grave = graveFixture({ id: 'final:fallen' })
    const corpse: WorldChestSnapshot = {
        id: 'corpse:fallen:1',
        kind: 'corpse',
        title: 'Тело: Павший',
        position: { ...grave.position },
        state: 'closed',
        itemCount: 2,
        corpse: { characterId: 'fallen', visualId: 'player', facing: 'down' },
    }
    const snapshot = { ...worldFixture([player]), graves: [grave], chests: [corpse] }
    const select = (targetKey?: string) =>
        nearbyInteractionTarget(snapshot, player, [], undefined, targetKey)
    return { player, grave, corpse, snapshot, select }
}

describe('one E target for a grave and its coincident corpse', () => {
    it.each(['active', 'ruined'] as const)(
        'offers the %s grave and exact corpse commands together instead of hiding purification behind loot',
        (phase) => {
            const f = fixture()
            f.grave.phase = phase
            if (phase === 'ruined') f.grave.hp = 0
            const target = f.select()
            expect(target?.key).toBe(`grave:${f.grave.id}`)
            expect(target?.actions).toEqual([
                ...graveActions(f.player, f.grave),
                {
                    id: `chest:${f.corpse.id}`,
                    label: 'Обыскать: Павший',
                    command: { type: 'open_chest', chestId: f.corpse.id },
                },
            ])
            expect(f.select(`chest:${f.corpse.id}`)).toBeUndefined()
            expect(f.snapshot.chests).toEqual([f.corpse])
            expect(f.corpse.itemCount).toBe(2)
        }
    )

    it('restores the ordinary corpse target after purification and keeps its shorter reach requirement', () => {
        const f = fixture()
        f.grave.phase = 'purified'
        expect(f.select()?.key).toBe(`chest:${f.corpse.id}`)
        expect(f.select()?.actions.map((action) => action.command)).toEqual([
            { type: 'open_chest', chestId: f.corpse.id },
        ])
        f.grave.phase = 'active'
        f.player.position.y = f.grave.position.y - 40
        expect(f.select()?.key).toBe(`grave:${f.grave.id}`)
        expect(f.select()?.actions).toEqual(graveActions(f.player, f.grave))
    })
})

describe('independent interaction identities', () => {
    it('leaves ordinary chests and offset corpses independent, with no nearest-body substitution', () => {
        const f = fixture()
        const otherCorpse = {
            ...f.corpse,
            id: 'other-corpse',
            position: { x: f.grave.position.x + 1, y: f.grave.position.y },
        }
        const ordinaryChest: WorldChestSnapshot = {
            id: 'ordinary-chest',
            position: f.corpse.position,
            state: 'closed',
            itemCount: 1,
        }
        f.snapshot.chests.push(otherCorpse, ordinaryChest)
        const pinned = f.select(`grave:${f.grave.id}`)
        expect(pinned?.actions.filter((action) => action.command.type === 'open_chest')).toEqual([
            {
                id: `chest:${f.corpse.id}`,
                label: 'Обыскать: Павший',
                command: { type: 'open_chest', chestId: f.corpse.id },
            },
        ])
        expect(f.select(`chest:${otherCorpse.id}`)?.actions[0]?.command).toEqual({
            type: 'open_chest',
            chestId: otherCorpse.id,
        })
        expect(f.select(`chest:${ordinaryChest.id}`)?.actions[0]?.command).toEqual({
            type: 'open_chest',
            chestId: ordinaryChest.id,
        })
        f.snapshot.chests.shift()
        expect(f.select(`grave:${f.grave.id}`)?.actions).toEqual(graveActions(f.player, f.grave))
        expect(pinned?.actions.at(-1)?.command).toEqual({
            type: 'open_chest',
            chestId: f.corpse.id,
        })
    })

    it('keeps exact identities if a different body replaces the original at the same position', () => {
        const f = fixture()
        const original = f.select(`grave:${f.grave.id}`)?.actions.at(-1)
        f.snapshot.chests = [{ ...f.corpse, id: 'different-corpse', title: 'Тело: Другой' }]
        const replacement = f.select(`grave:${f.grave.id}`)?.actions.at(-1)
        expect(original?.id).toBe(`chest:${f.corpse.id}`)
        expect(original?.command).toEqual({ type: 'open_chest', chestId: f.corpse.id })
        expect(replacement?.id).toBe('chest:different-corpse')
        expect(replacement?.command).toEqual({ type: 'open_chest', chestId: 'different-corpse' })
    })

    it('keeps different graves pinned and preserves visibility and actor-life validation', () => {
        const f = fixture()
        const neighboringGrave = graveFixture({ id: 'neighbor', position: { x: 16, y: 24 } })
        f.snapshot.graves.push(neighboringGrave)
        expect(f.select(`grave:${neighboringGrave.id}`)?.actions).toEqual(
            graveActions(f.player, neighboringGrave)
        )
        expect(nearbyInteractionTarget(f.snapshot, f.player, [], () => false)).toBeUndefined()
        f.player.alive = false
        expect(f.select()).toBeUndefined()
    })
})

it('opens one E menu with grave and corpse actions, then closes instead of selecting replacement loot', async () => {
    const f = fixture()
    const wrapper = mount(NearbyInteraction, {
        props: { snapshot: f.snapshot, player: f.player, characters: [], blocked: false },
        attachTo: document.body,
    })
    try {
        wrapper.vm.openMenu()
        await flushPromises()
        expect(wrapper.get('[role="menu"]').text()).toContain('Упокоить могилу')
        expect(wrapper.get('[role="menu"]').text()).toContain('Обыскать: Павший')
        const menu = wrapper.getComponent(NearbyActionMenu)
        const originalCommandCount = wrapper.emitted('command')?.length
        await wrapper.setProps({
            snapshot: {
                ...f.snapshot,
                chests: [{ ...f.corpse, id: 'new-body', title: 'Тело: Другой' }],
            },
        })
        expect(wrapper.find('[role="menu"]').exists()).toBe(false)
        menu.vm.$emit('select', `chest:${f.corpse.id}`)
        menu.vm.$emit('select', 'chest:new-body')
        await flushPromises()
        expect(wrapper.emitted('command')).toHaveLength(originalCommandCount ?? 0)
        expect(f.snapshot.chests).toEqual([f.corpse])
    } finally {
        wrapper.unmount()
    }
})
