import type { ClientMessage } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import App from '../../App.vue'
import type { RatataGameOptions } from '../runtime/runtimeOptions'
import { characterFixture, worldFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

const runtime = vi.hoisted(() => ({
    options: undefined as RatataGameOptions | undefined,
    pendingStart: undefined as Promise<void> | undefined,
    stop: vi.fn<() => void>(),
    release: vi.fn<() => void>(),
    send: vi.fn<(command: ClientMessage) => void>(),
}))
vi.mock('../runtime/ratataGame', () => ({
    RatataGame: class {
        public constructor(options: RatataGameOptions) {
            runtime.options = options
        }
        public start(): Promise<void> {
            if (runtime.pendingStart) return runtime.pendingStart
            runtime.options?.onStatus('Connected')
            const player = characterFixture('self')
            runtime.options?.onSnapshot(worldFixture([player]), player.id)
            return Promise.resolve()
        }
        public readonly planting = {
            set: () => undefined,
            preview: () => undefined,
            subscribe: () => () => undefined,
        }
        public projectPosition(): undefined {
            return undefined
        }
        public sendCommand(command: ClientMessage): void {
            runtime.send(command)
        }
        public cancelChat(): void {
            runtime.options?.onChatState({ active: false, draft: '', maxLength: 100 })
        }
        public releaseUiControls(): void {
            runtime.release()
        }
        public stop(): void {
            runtime.stop()
        }
        public setInteractionTarget(): void {
            /* Renderer is outside this App test. */
        }
        public setCombatTarget(): void {
            /* Renderer is outside this App test. */
        }
        public isInteractionVisible(): boolean {
            return true
        }
        public isCharacterVisible(): boolean {
            return true
        }
    },
}))
afterEach(() => {
    vi.clearAllMocks()
    runtime.options = undefined
    runtime.pendingStart = undefined
})

async function joined() {
    const wrapper = mount(App, {
        attachTo: document.body,
        global: { stubs: { SpeechBubbles: true, AdventurePanel: true, NearbyInteraction: true } },
    })
    await wrapper.get('#nickname').setValue('СеверныйСтранник')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    return wrapper
}
async function pressEscape(repeat = false): Promise<void> {
    const target = document.activeElement ?? document.body
    target.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true, repeat })
    )
    await flushPromises()
}
it('opens markers and scenarios from the game menu and lets Escape return to the world', async () => {
    const wrapper = await joined()
    try {
        await pressEscape()
        await wrapper.get('[data-dialog-action="markers"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        expect(wrapper.find('[role="dialog"][aria-label="Метки"]').exists()).toBe(true)
        await pressEscape()
        expect(wrapper.find('[aria-label="Метки"]').exists()).toBe(false)
        await pressEscape()
        await wrapper.get('[data-dialog-action="scenarios"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[role="dialog"][aria-label="Сценарии"]').exists()).toBe(true)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
    } finally {
        wrapper.unmount()
    }
})
it('can leave a pending startup through Escape or the visible menu button before any snapshot arrives', async () => {
    let complete!: () => void
    runtime.pendingStart = new Promise<void>((resolve) => {
        complete = resolve
    })
    const wrapper = await joined()
    try {
        expect(wrapper.find('[aria-label="Player status"]').exists()).toBe(false)
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(true)
        await pressEscape()
        await wrapper.get('button[aria-label="Игровое меню"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('.game-menu').exists()).toBe(true)
        await wrapper.get('[data-dialog-action="leave"]').trigger('click')
        await flushPromises()
        expect(runtime.stop).toHaveBeenCalledOnce()
        expect(runtime.send).not.toHaveBeenCalledWith({ type: 'abandon_life' })
        expect(wrapper.find('.game-screen').exists()).toBe(false)
        expect(document.activeElement).toBe(wrapper.get('#nickname').element)
        complete()
        await flushPromises()
        expect(wrapper.find('.game-screen').exists()).toBe(false)
        expect(wrapper.get('form button').attributes('disabled')).toBeUndefined()
        expect(wrapper.find('.join-error').exists()).toBe(false)
    } finally {
        complete()
        wrapper.unmount()
    }
})
it.each(['error', 'cancel'] as const)(
    'keeps an unconfirmed generated name create-only after startup %s',
    async (outcome) => {
        let complete!: () => void
        runtime.pendingStart = new Promise<void>((resolve) => {
            complete = resolve
        })
        const wrapper = mount(App, {
            attachTo: document.body,
            global: {
                stubs: { SpeechBubbles: true, AdventurePanel: true, NearbyInteraction: true },
            },
        })
        try {
            const proposed = wrapper.get<HTMLInputElement>('#nickname').element.value
            await wrapper.get('form').trigger('submit')
            await flushPromises()
            expect(runtime.options?.createOnly).toBe(true)
            if (outcome === 'error') runtime.options?.onError('Connection failed')
            else {
                await pressEscape()
                await wrapper.get('[data-dialog-action="leave"]').trigger('click')
            }
            await flushPromises()
            expect(wrapper.get<HTMLInputElement>('#nickname').element.value).toBe(proposed)
            await wrapper.get('form').trigger('submit')
            await flushPromises()
            expect(runtime.options?.nickname).toBe(proposed)
            expect(runtime.options?.createOnly).toBe(true)
            complete()
            await flushPromises()
        } finally {
            complete()
            wrapper.unmount()
        }
    }
)
it('opens a local menu, traps its confirmation and exits through cleanup without retiring the character', async () => {
    const wrapper = await joined()
    try {
        await pressEscape()
        expect(
            wrapper.get('[role="dialog"][aria-label="Игровое меню"]').attributes('aria-modal')
        ).toBe('true')
        expect(runtime.release).toHaveBeenCalledOnce()
        expect(runtime.stop).not.toHaveBeenCalled()
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        await wrapper.get('button[aria-label="Игровое меню"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-dialog-action="leave"]').trigger('click')
        await flushPromises()
        expect(runtime.stop).toHaveBeenCalledOnce()
        expect(runtime.send).not.toHaveBeenCalledWith({ type: 'abandon_life' })
        expect(wrapper.find('.game-screen').exists()).toBe(false)
        expect(document.activeElement).toBe(wrapper.get('#nickname').element)
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        expect(wrapper.find('.game-screen').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})
it('closes inventory and chat separately before a later Escape opens the game menu', async () => {
    const wrapper = await joined()
    try {
        runtime.options?.onInventoryToggle()
        await flushPromises()
        expect(wrapper.find('.inventory-overlay').exists()).toBe(true)
        await pressEscape()
        expect(wrapper.find('.inventory-overlay').exists()).toBe(false)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        await pressEscape(true)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        runtime.options?.onChatState({ active: true, draft: 'не отправлять', maxLength: 100 })
        await flushPromises()
        await pressEscape()
        expect(wrapper.find('.chat-input').exists()).toBe(false)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        expect(runtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'chat' }))
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})
it('keeps exit available after disconnect and while a fallen character awaits rescue', async () => {
    const wrapper = await joined()
    try {
        const fallen = characterFixture('self', { alive: false })
        runtime.options?.onSnapshot(worldFixture([fallen]), fallen.id)
        runtime.options?.onStatus('Disconnected')
        await flushPromises()
        await pressEscape()
        expect(wrapper.find('.death-overlay').exists()).toBe(true)
        expect(wrapper.find('.game-menu').exists()).toBe(true)
        await wrapper.get('[data-dialog-action="leave"]').trigger('click')
        await flushPromises()
        expect(runtime.stop).toHaveBeenCalledOnce()
        expect(runtime.send).not.toHaveBeenCalledWith({ type: 'abandon_life' })
        expect(wrapper.find('#nickname').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})

it('cancels active chat before an inventory that still holds DOM focus', async () => {
    const wrapper = await joined()
    try {
        runtime.options?.onInventoryToggle()
        await flushPromises()
        runtime.options?.onChatState({ active: true, draft: 'draft', maxLength: 100 })
        await flushPromises()
        await pressEscape()
        expect(wrapper.find('.chat-input').exists()).toBe(false)
        expect(wrapper.find('.inventory-overlay').exists()).toBe(true)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
    } finally {
        wrapper.unmount()
    }
})

it('keeps hidden inventory unchanged on death and returns focus to the death dialog after the menu', async () => {
    const wrapper = await joined()
    try {
        runtime.options?.onInventoryToggle()
        await flushPromises()
        const fallen = characterFixture('self', { alive: false })
        runtime.options?.onSnapshot(worldFixture([fallen]), fallen.id)
        await flushPromises()
        expect(document.activeElement).toBe(wrapper.get('.death-overlay__card').element)
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(true)
        expect(wrapper.find('.inventory-overlay').exists()).toBe(true)
        expect(wrapper.get('.death-overlay').element.closest('[inert]')).not.toBeNull()
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        expect(document.activeElement).toBe(wrapper.get('.death-overlay__card').element)
        expect(wrapper.find('.inventory-overlay').exists()).toBe(true)
        expect(runtime.send).not.toHaveBeenCalledWith({ type: 'abandon_life' })
    } finally {
        wrapper.unmount()
    }
})

it('restores the prior HUD focus after resuming a living character', async () => {
    const wrapper = await joined()
    try {
        const button = wrapper.get<HTMLButtonElement>('button[aria-label="Игровое меню"]')
        button.element.focus()
        await button.trigger('click')
        await flushPromises()
        await pressEscape()
        expect(document.activeElement).toBe(button.element)
    } finally {
        wrapper.unmount()
    }
})

it('releases a closed hotbar picker whose Vue template ref became null', async () => {
    const wrapper = await joined()
    try {
        await wrapper.getComponent(ActionHotbar).vm.edit(2)
        await wrapper.get('.hotbar-picker button').trigger('click')
        await flushPromises()
        expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})

it('clears selection and cancels a ritual before a subsequent Escape opens the menu', async () => {
    const wrapper = await joined()
    try {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
        await flushPromises()
        expect(wrapper.find('[aria-label="Выбранная цель"]').exists()).toBe(true)
        await pressEscape()
        expect(wrapper.find('[aria-label="Выбранная цель"]').exists()).toBe(false)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        const praying = characterFixture('self', {
            abilities: {
                known: ['pray'],
                cooldowns: {},
                barrier: null,
                casting: {
                    abilityId: 'pray',
                    mode: 'purify_grave',
                    targetId: 'grave',
                    target: { kind: 'grave', id: 'grave' },
                    startedAt: 100_000,
                    completesAt: 150_000,
                },
            },
        })
        runtime.options?.onSnapshot(worldFixture([praying]), praying.id)
        await flushPromises()
        await pressEscape()
        expect(runtime.send).toHaveBeenCalledWith({ type: 'cancel_prayer' })
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        runtime.options?.onSnapshot(worldFixture([characterFixture('self')]), 'self')
        await flushPromises()
        await pressEscape()
        expect(wrapper.find('.game-menu').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})

it('consumes planting Escape before the main game menu and allows another slot activation', async () => {
    const wrapper = await joined()
    try {
        const hotbar = wrapper.getComponent(ActionHotbar)
        await hotbar.vm.edit(3)
        await flushPromises()
        await hotbar
            .get('.hotbar-picker')
            .findAll('button')
            .find((button) => button.text().startsWith('Саженец'))!
            .trigger('click')
        hotbar.vm.activate(3)
        await flushPromises()
        expect(wrapper.find('[aria-label="Посадка дерева"]').exists()).toBe(true)
        await pressEscape()
        expect(wrapper.find('[aria-label="Посадка дерева"]').exists()).toBe(false)
        expect(wrapper.find('.game-menu').exists()).toBe(false)
        hotbar.vm.activate(3)
        await flushPromises()
        expect(wrapper.find('[aria-label="Посадка дерева"]').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})
