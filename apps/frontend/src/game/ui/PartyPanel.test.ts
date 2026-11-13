import type { PartySnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PartyPanel from './PartyPanel.vue'

describe('party roster', () => {
    it('puts the crowned leader first, shows only percentages and distinguishes absent members', async () => {
        const party: PartySnapshot = {
            partyId: 'p',
            leaderId: 'leader',
            members: [
                {
                    id: 'ally',
                    nickname: 'Союзник',
                    hpPercent: 27,
                    alive: true,
                    online: true,
                    locationId: 'map-2-1',
                },
                {
                    id: 'leader',
                    nickname: 'Лидер',
                    hpPercent: 100,
                    alive: true,
                    online: true,
                    locationId: 'map-2-2',
                },
                {
                    id: 'body',
                    nickname: 'Друг',
                    hpPercent: 0,
                    alive: false,
                    online: true,
                    locationId: 'map-2-2',
                },
            ],
            invitations: [],
            jobs: [],
            activeJob: null,
            notice: null,
        }
        const wrapper = mount(PartyPanel, { props: { party, currentLocationId: 'map-2-2' } })
        try {
            const buttons = wrapper.findAll('button')
            expect(buttons[0]?.text()).toContain('Лидер')
            expect(buttons[0]?.find('[aria-label="Лидер"]').exists()).toBe(true)
            expect(buttons[1]?.text()).toContain('27%')
            expect(buttons[1]?.text()).toContain('Другая локация')
            expect(buttons[2]?.text()).toContain('Ожидает спасения')
            expect(buttons[2]?.text()).toContain('0%')
            expect(party.members[0]?.id).toBe('ally')
            expect(wrapper.text()).not.toContain('27/100')
            await buttons[1]?.trigger('click')
            expect(wrapper.emitted('select')).toEqual([['ally']])
            await wrapper.setProps({ party: { ...party, leaderId: 'ally' }, selectedId: 'ally' })
            const promoted = wrapper.findAll('button')[0]
            expect(promoted?.text()).toContain('Союзник')
            expect(promoted?.attributes('aria-pressed')).toBe('true')
            expect(promoted?.find('[aria-label="Лидер"]').exists()).toBe(true)
        } finally {
            wrapper.unmount()
        }
    })
})
