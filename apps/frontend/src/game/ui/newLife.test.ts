import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../../App.vue'

const runtime = vi.hoisted(() => ({
    defeat: undefined as (() => void) | undefined,
    stop: vi.fn<() => void>(),
    starts: 0,
}))

vi.mock('../runtime/ratataGame', () => ({
    RatataGame: class {
        public setInteractionTarget(): void {
            /* No canvas renderer in the App unit test. */
        }
        public isInteractionVisible(): boolean {
            return true
        }
        public constructor(options: { onDefeat?: () => void }) {
            runtime.defeat = options.onDefeat
        }
        public start(): Promise<void> {
            runtime.starts++
            return Promise.resolve()
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
