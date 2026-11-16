import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import App from '../../App.vue'
import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'

const runtime = vi.hoisted(() => ({
    snapshot: undefined as ((snapshot: WorldSnapshot, playerId: string) => void) | undefined,
}))
vi.mock('../runtime/ratataGame', () => ({
    RatataGame: class {
        public setCombatTarget(): void {}
        public sendCommand(): void {}
        public setInteractionTarget(): void {
            /* No canvas renderer in the App unit test. */
        }
        public isInteractionVisible(): boolean {
            return true
        }
        public constructor(options: { onSnapshot: typeof runtime.snapshot }) {
            runtime.snapshot = options.onSnapshot
        }
        public start(): Promise<void> {
            return Promise.resolve()
        }
        public stop(): void {
            /* no engine in the Vue feedback test */
        }
        public isCharacterVisible(): boolean {
            return true
        }
    },
}))
afterEach(() => {
    vi.useRealTimers()
    runtime.snapshot = undefined
})

describe('action notice integration', () => {
    it('renders one temporary toast despite recurring snapshots and replays a fresh same-text action', async () => {
        const wrapper = mount(App)
        try {
            await wrapper.get('#nickname').setValue('NoticeHero')
            await wrapper.get('form').trigger('submit')
            await flushPromises()
            vi.useFakeTimers()
            const player = characterFixture('hero')
            const snapshot = {
                ...worldFixture([player]),
                adventure: {
                    ...adventureFixture(),
                    notice: 'В бочке: дерево +1, волокно +1.',
                    noticeId: 1,
                },
            }
            runtime.snapshot?.(snapshot, player.id)
            await nextTick()
            expect(wrapper.get('.game-notice').text()).toContain('В бочке')
            expect(wrapper.find('.adventure-notice').exists()).toBe(false)
            for (let second = 0; second < 5; second++) {
                vi.advanceTimersByTime(1_000)
                runtime.snapshot?.({ ...snapshot, tick: second + 2 }, player.id)
                await nextTick()
            }
            expect(wrapper.find('.game-notice').exists()).toBe(false)
            runtime.snapshot?.(
                { ...snapshot, adventure: { ...snapshot.adventure, noticeId: 2 } },
                player.id
            )
            await nextTick()
            expect(wrapper.get('.game-notice').text()).toContain('В бочке')
        } finally {
            wrapper.unmount()
        }
        expect(vi.getTimerCount()).toBe(0)
    })
})
