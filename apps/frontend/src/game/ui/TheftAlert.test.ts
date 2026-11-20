import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import TheftAlert from './TheftAlert.vue'

describe('crime feedback', () => {
    it('lets a victim call guards and removes the action at the server deadline', async () => {
        const player = characterFixture('victim')
        player.theft!.accusations = [
            {
                thiefId: 'thief',
                thiefName: 'Ловкач',
                expiresAt: 130_000,
                canCallGuards: true,
                reported: false,
            },
        ]
        const wrapper = mount(TheftAlert, { props: { player, serverTime: 100_000 } })
        try {
            expect(wrapper.text()).toContain('Ловкач')
            expect(wrapper.text()).toContain('30 с')
            await wrapper.get('button').trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'call_guards', targetId: 'thief' }],
            ])
            await wrapper.setProps({ serverTime: 130_000 })
            expect(wrapper.find('button').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps formal proof after calling, then hides a submitted report', async () => {
        const player = characterFixture('victim')
        player.theft!.accusations = [
            {
                thiefId: 'thief',
                thiefName: 'Ловкач',
                expiresAt: 400_000,
                canCallGuards: false,
                reported: false,
            },
        ]
        const wrapper = mount(TheftAlert, { props: { player, serverTime: 140_000 } })
        try {
            expect(wrapper.find('button').exists()).toBe(false)
            expect(wrapper.text()).toContain('официальной жалобы')
            expect(wrapper.text()).toContain('260 с')
            await wrapper.setProps({
                player: {
                    ...player,
                    theft: {
                        ...player.theft!,
                        accusations: [{ ...player.theft!.accusations[0]!, reported: true }],
                    },
                },
            })
            expect(wrapper.find('aside').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
})
