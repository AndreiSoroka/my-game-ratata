import type { TheftAccusation } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TheftAlert from './TheftAlert.vue'

describe('crime feedback', () => {
    it('lets a victim call guards and removes the action at the server deadline', async () => {
        const evidence: TheftAccusation[] = [
            {
                thiefId: 'thief',
                thiefName: 'Ловкач',
                expiresAt: 130_000,
                canCallGuards: true,
                reported: false,
            },
        ]
        const wrapper = mount(TheftAlert, { props: { evidence, alive: true, serverTime: 100_000 } })
        try {
            expect(wrapper.text()).toContain('Ловкач')
            expect(wrapper.text()).toContain('30 с')
            await wrapper.get('button').trigger('click')
            expect(wrapper.emitted('callGuards')).toEqual([['thief']])
            await wrapper.setProps({ serverTime: 130_000 })
            expect(wrapper.find('button').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps formal proof after calling, then hides a submitted report', async () => {
        const evidence: TheftAccusation[] = [
            {
                thiefId: 'thief',
                thiefName: 'Ловкач',
                expiresAt: 400_000,
                canCallGuards: false,
                reported: false,
            },
        ]
        const wrapper = mount(TheftAlert, { props: { evidence, alive: true, serverTime: 140_000 } })
        try {
            expect(wrapper.find('button').exists()).toBe(false)
            expect(wrapper.text()).toContain('официальной жалобы')
            expect(wrapper.text()).toContain('260 с')
            await wrapper.setProps({ evidence: [{ ...evidence[0]!, reported: true }] })
            expect(wrapper.find('[role="region"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
    it('shows assault evidence as a formal report without offering an emergency theft call', () => {
        const evidence: TheftAccusation[] = [
            {
                thiefId: 'assailant',
                thiefName: 'Нападавший',
                offense: 'attack',
                expiresAt: 400_000,
                canCallGuards: false,
                reported: false,
            },
        ]
        const wrapper = mount(TheftAlert, { props: { evidence, alive: true, serverTime: 140_000 } })
        try {
            expect(wrapper.text()).toContain('Есть свидетельство нападения')
            expect(wrapper.text()).toContain('официальной жалобы')
            expect(wrapper.text()).not.toContain('Экстренный зов')
            expect(wrapper.find('button').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
})
