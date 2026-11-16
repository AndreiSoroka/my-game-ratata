import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import ChestContainer from './ChestContainer.vue'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

describe('shared barrel inspection', () => {
    it('shows the real barrel title and retains original take/put command identities', async () => {
        const player = characterFixture('player', {
            inventory: [{ instanceId: 'bag-axe', itemId: 'axe', durability: 77 }],
        })
        const wrapper = mount(ChestContainer, {
            props: {
                player,
                chest: {
                    kind: 'barrel',
                    title: 'Бочка общих припасов',
                    chestId: 'barrel-1',
                    items: [{ instanceId: 'barrel-wood', itemId: 'wood' }],
                },
            },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.get('h2').text()).toBe('Рюкзак и бочка')
            expect(wrapper.text()).toContain('Бочка общих припасов')
            expect(wrapper.emitted('command')).toBeUndefined()
            await wrapper.get('[data-dialog-action="chest:barrel-wood"]').trigger('click')
            await wrapper.get('[data-dialog-action="bag:bag-axe"]').trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'take_chest_item', chestId: 'barrel-1', itemInstanceId: 'barrel-wood' }],
                [{ type: 'put_chest_item', chestId: 'barrel-1', itemInstanceId: 'bag-axe' }],
            ])
            await wrapper.setProps({ chest: { kind: 'barrel', chestId: 'barrel-1', items: [] } })
            expect(wrapper.text()).toContain('Контейнер пуст.')
            expect(wrapper.get('[data-dialog-action="all"]').attributes('disabled')).toBeDefined()
        } finally {
            wrapper.unmount()
        }
    })
    it('provides one F target at chest range, even if old world metadata is still present', () => {
        const player = characterFixture('player', { position: { x: 64, y: 64 }, facing: 'right' })
        const bounds = { x: 92, y: 56, width: 16, height: 16 }
        const barrel = {
            id: 'barrel-1',
            kind: 'barrel' as const,
            title: 'Бочка',
            position: { x: 100, y: 64 },
            bounds,
            propId: 'prop-1',
            state: 'closed' as const,
            itemCount: 2,
        }
        const snapshot = {
            ...worldFixture([player]),
            chests: [barrel],
            adventure: {
                ...adventureFixture(),
                worldObjects: [
                    {
                        id: barrel.id,
                        kind: 'barrel' as const,
                        name: 'Бочка',
                        position: barrel.position,
                        bounds,
                        depleted: false,
                    },
                ],
            },
        }
        const target = nearbyInteractionTarget(snapshot, player, [])
        expect(target).toMatchObject({
            key: 'chest:barrel-1',
            bounds,
            actions: [
                {
                    id: 'chest:barrel-1',
                    label: 'Открыть бочку',
                    command: { type: 'open_chest', chestId: 'barrel-1' },
                },
            ],
        })
        expect(
            nearbyInteractionTarget(snapshot, player, [], undefined, 'world:barrel-1')
        ).toBeUndefined()
        player.position.x -= 0.01
        expect(nearbyInteractionTarget(snapshot, player, [])).toBeUndefined()
    })
})
