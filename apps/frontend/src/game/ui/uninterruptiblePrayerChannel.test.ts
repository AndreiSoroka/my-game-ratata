import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionChannelStatus from './ActionChannelStatus.vue'

it('does not offer voluntary cancellation for a frozen Last Light channel', async () => {
    const player = characterFixture('cleric')
    player.abilities = {
        known: ['pray'],
        cooldowns: {},
        barrier: null,
        casting: {
            abilityId: 'pray',
            mode: 'restore',
            targetId: player.id,
            startedAt: 0,
            completesAt: 3000,
            uninterruptible: true,
        },
    }
    const view = mount(ActionChannelStatus, { props: { player, serverTime: 1000 } })
    expect(view.text()).toContain('Молитва')
    expect(view.find('button').exists()).toBe(false)
    await view.setProps({
        player: {
            ...player,
            abilities: {
                ...player.abilities,
                casting: { ...player.abilities.casting!, uninterruptible: false },
            },
        },
    })
    await view.get('button').trigger('click')
    expect(view.emitted('cancelPrayer')).toHaveLength(1)
    view.unmount()
})
