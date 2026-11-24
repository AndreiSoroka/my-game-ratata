import {
    applySnapshotPatch,
    diffSnapshots,
    freezeSnapshot,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { worldFixture } from '../testing/characterFixture'
import { playerStatusFixture } from '../testing/playerStatusFixture'
import ActionChannelStatus from '../ui/ActionChannelStatus.vue'
import GamePlayerStatus from '../ui/GamePlayerStatus.vue'
import MovementStatus from '../ui/MovementStatus.vue'

it('updates time-driven overlays while frozen unchanged player and HUD branches retain identity', async () => {
    const player = playerStatusFixture({
        abilities: {
            known: ['chains'],
            barrier: null,
            casting: null,
            cooldowns: {},
            magicChannel: { abilityId: 'chains', startedAt: 100000, completesAt: 105000 },
        },
    })
    const initial = freezeSnapshot({ ...worldFixture([player]), stepMs: 50 })
    const snapshot = shallowRef<WorldSnapshot>(initial)
    const wrapper = mount(
        defineComponent(() => () => {
            const state = snapshot.value
            const character = state.characters[0]!
            return h('div', [
                h(GamePlayerStatus, { character, serverTime: state.serverTime }),
                h(MovementStatus, { character }),
                h(ActionChannelStatus, { player: character, serverTime: state.serverTime }),
            ])
        })
    )
    expect(wrapper.get('[role="status"]').text()).toContain('5 с')
    const health = wrapper.findAll('[role="progressbar"]')[0]!.element
    const next = { ...initial, tick: 2, serverTime: 102100, stepMs: 50 }
    snapshot.value = freezeSnapshot(applySnapshotPatch(initial, diffSnapshots(initial, next), next))
    await nextTick()
    expect(snapshot.value.characters[0]).toBe(initial.characters[0])
    expect(wrapper.get('[role="status"]').text()).toContain('3 с')
    expect(wrapper.findAll('[role="progressbar"]')[0]!.element).toBe(health)
    expect(wrapper.get('h2').text()).toBe(player.nickname)
    expect(initial.serverTime).toBe(100000)
    const changed = {
        ...next,
        tick: 3,
        serverTime: 102150,
        characters: [
            {
                ...player,
                movement: { mode: 'walking' as const, dashing: false, dashCooldownMsLeft: 1500 },
            },
        ],
    }
    snapshot.value = freezeSnapshot(
        applySnapshotPatch(snapshot.value, diffSnapshots(snapshot.value, changed), changed)
    )
    await nextTick()
    expect(wrapper.get('.movement-status').text()).toContain('2')
    expect(initial.characters[0]!.movement!.dashCooldownMsLeft).toBe(0)
    wrapper.unmount()
})
