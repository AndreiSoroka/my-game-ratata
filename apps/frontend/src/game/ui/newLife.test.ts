import type { ClientMessage, HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../../App.vue'
import { characterFixture, worldFixture } from '../testing/characterFixture'

const runtime = vi.hoisted(() => ({
    defeat: undefined as (() => void) | undefined,
    stop: vi.fn<() => void>(),
    starts: 0,
    classes: [] as (HeroClass | undefined)[],
    send: vi.fn<(command: ClientMessage) => void>(),
    snapshot: undefined as ((snapshot: WorldSnapshot, id: string | undefined) => void) | undefined,
    status: undefined as ((status: string) => void) | undefined,
}))

vi.mock('../runtime/ratataGame', () => ({
    RatataGame: class {
        public setInteractionTarget(): void {
            /* No canvas renderer in the App unit test. */
        }
        public isCharacterVisible(): boolean {
            return true
        }
        public isInteractionVisible(): boolean {
            return true
        }
        public constructor(options: {
            onDefeat?: () => void
            onSnapshot: (snapshot: WorldSnapshot, id: string | undefined) => void
            onStatus: (status: string) => void
            heroClass?: HeroClass
        }) {
            runtime.defeat = options.onDefeat
            runtime.snapshot = options.onSnapshot
            runtime.status = options.onStatus
            runtime.classes.push(options.heroClass)
        }
        public start(): Promise<void> {
            runtime.starts++
            runtime.status?.('Connected')
            return Promise.resolve()
        }
        public sendCommand(command: ClientMessage): void {
            runtime.send(command)
        }
        public stop(): void {
            runtime.stop()
        }
    },
}))

afterEach(() => {
    runtime.defeat = undefined
    runtime.starts = 0
    runtime.stop.mockClear()
    runtime.send.mockClear()
    runtime.snapshot = undefined
    runtime.status = undefined
    runtime.classes = []
})

describe('new life after permanent death', () => {
    it('keeps the new-life action available when the old character is absent from the snapshot', async () => {
        const wrapper = mount(App)
        try {
            await wrapper.get('#nickname').setValue('Hero')
            await wrapper.get('form').trigger('submit')
            await flushPromises()
            expect(runtime.starts).toBe(1)

            runtime.defeat?.()
            await flushPromises()
            const newLife = wrapper
                .findAll('button')
                .find((button) => button.text() === 'Начать новую жизнь')
            expect(newLife).toBeDefined()
            await newLife?.trigger('click')
            expect(runtime.stop).toHaveBeenCalledOnce()
            expect(wrapper.get('#nickname').element).toBeInstanceOf(HTMLInputElement)

            await wrapper.get('form').trigger('submit')
            await flushPromises()
            expect(runtime.starts).toBe(2)
            expect(wrapper.find('.death-overlay').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
})

it('waits for authoritative retirement before opening background selection and clears the old client session', async () => {
    const wrapper = mount(App, {
        attachTo: document.body,
        global: { stubs: { GameplayOverlay: true, AdventurePanel: true, NearbyInteraction: true } },
    })
    try {
        await wrapper.get('#nickname').setValue('Hero')
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        const downed = characterFixture('old-life', {
            alive: false,
            life: { retired: false, reviveMsLeft: 59000, reviveUntil: 60000 },
        })
        runtime.snapshot?.(worldFixture([downed]), downed.id)
        await flushPromises()
        const abandon = wrapper.get('.death-overlay button')
        expect(abandon.text()).toBe('Начать сначала')
        await abandon.trigger('click')
        await abandon.trigger('click')
        expect(runtime.send).toHaveBeenCalledExactlyOnceWith({ type: 'abandon_life' })
        expect(wrapper.find('#hero-class').exists()).toBe(false)
        expect(wrapper.get('.death-overlay').attributes('aria-busy')).toBe('true')
        expect(runtime.stop).not.toHaveBeenCalled()
        runtime.snapshot?.(worldFixture([downed]), downed.id)
        await flushPromises()
        expect(wrapper.find('#hero-class').exists()).toBe(false)
        runtime.defeat?.()
        await flushPromises()
        expect(runtime.stop).toHaveBeenCalledOnce()
        expect(wrapper.find('.death-overlay').exists()).toBe(false)
        expect(document.activeElement).toBe(wrapper.get('#hero-class').element)
        await wrapper.get('#hero-class').setValue('ranger')
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        expect(runtime.classes).toEqual(['vanguard', 'ranger'])
        expect(runtime.starts).toBe(2)
    } finally {
        wrapper.unmount()
    }
})
it('does not abandon a revived character or pretend that a disconnected request completed', async () => {
    const wrapper = mount(App, {
        global: { stubs: { GameplayOverlay: true, AdventurePanel: true, NearbyInteraction: true } },
    })
    try {
        await wrapper.get('#nickname').setValue('Hero')
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        const downed = characterFixture('old-life', {
            alive: false,
            life: { retired: false, reviveMsLeft: 59000, reviveUntil: 60000 },
        })
        runtime.snapshot?.(worldFixture([downed]), downed.id)
        runtime.status?.('Disconnected')
        await flushPromises()
        expect(wrapper.get('.death-overlay button').attributes('disabled')).toBeDefined()
        await wrapper.get('.death-overlay button').trigger('click')
        expect(runtime.send).not.toHaveBeenCalled()
        runtime.status?.('Connected')
        await flushPromises()
        await wrapper.get('.death-overlay button').trigger('click')
        const revived = { ...downed, alive: true }
        runtime.snapshot?.(worldFixture([revived]), revived.id)
        await flushPromises()
        expect(wrapper.find('.death-overlay').exists()).toBe(false)
        expect(wrapper.find('#hero-class').exists()).toBe(false)
        expect(runtime.stop).not.toHaveBeenCalled()
    } finally {
        wrapper.unmount()
    }
})
