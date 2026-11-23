import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import App from '../../App.vue'
import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { developmentCharacterFixture } from '../testing/developmentFixture'

const runtime = vi.hoisted(() => ({
    snapshot: undefined as ((snapshot: WorldSnapshot, playerId: string) => void) | undefined,
    playUiSound: vi.fn<(id: string) => void>(),
}))
vi.mock('../runtime/ratataGame', () => ({
    RatataGame: class {
        public playUiSound = runtime.playUiSound
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
    runtime.playUiSound.mockClear()
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

    it('uses the same five-second toast for private sky discoveries without extending it on snapshots', async () => {
        const wrapper = mount(App)
        try {
            await wrapper.get('#nickname').setValue('StarHero')
            await wrapper.get('form').trigger('submit')
            await flushPromises()
            vi.useFakeTimers()
            const player = developmentCharacterFixture()
            const initial = worldFixture([player])
            runtime.snapshot?.(initial, player.id)
            await nextTick()
            expect(wrapper.find('.game-notice').exists()).toBe(false)
            const learned = structuredClone(player)
            learned.progression!.constellations!.nodes.push({
                id: 'node-new',
                constellationId: 'prayer',
                x: 0,
                y: 0,
                parents: ['node-root'],
                unlocked: true,
                kind: 'passive',
                name: 'Тёплый дар',
            })
            const changed = { ...worldFixture([learned]), tick: 2 }
            runtime.snapshot?.(changed, player.id)
            await nextTick()
            expect(wrapper.findAll('.game-notice')).toHaveLength(1)
            expect(wrapper.get('.game-notice').text()).toBe('Открыта звезда: «Тёплый дар».')
            expect(runtime.playUiSound).toHaveBeenCalledExactlyOnceWith('uiConfirmation')
            for (let frame = 0; frame < 5; frame++) {
                vi.advanceTimersByTime(1_000)
                runtime.snapshot?.({ ...changed, tick: frame + 3 }, player.id)
                await nextTick()
            }
            expect(wrapper.find('.game-notice').exists()).toBe(false)
            runtime.snapshot?.(initial, player.id)
            runtime.snapshot?.(changed, player.id)
            await nextTick()
            expect(wrapper.find('.game-notice').exists()).toBe(false)
            expect(runtime.playUiSound).toHaveBeenCalledTimes(1)
        } finally {
            wrapper.unmount()
        }
        expect(vi.getTimerCount()).toBe(0)
    })
})
