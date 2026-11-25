import type { ClientMessage } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { whisperFixture } from '@/game/testing/socialFixtures'

import PrivateConversation from './PrivateConversation.vue'

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

it('sends bounded text-free typing hints and clears them on idle, blur, submit and unmount', async () => {
    const wrapper = mount(PrivateConversation, {
        props: { conversation: whisperFixture(), playerId: 'self' },
    })
    const commands = () =>
        ((wrapper.emitted('command') ?? []) as Array<[ClientMessage]>).map(([message]) => message)
    const field = wrapper.get('input')
    try {
        await field.setValue('Личный черновик')
        const first = commands()[0]
        expect(first).toMatchObject({
            type: 'speech_activity',
            active: true,
            channel: 'whisper',
            targetId: 'partner',
        })
        expect(first).not.toHaveProperty('text')
        await vi.advanceTimersByTimeAsync(500)
        await field.setValue('Личный черновик 2')
        expect(commands()).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(500)
        await field.setValue('Личный черновик 3')
        expect(commands()).toHaveLength(2)
        await vi.advanceTimersByTimeAsync(3000)
        expect(commands().at(-1)).toEqual({ ...first, active: false })
        await field.setValue('Пишу снова')
        const second = commands().at(-1)
        expect(second).not.toEqual(first)
        await field.trigger('blur')
        expect(commands().at(-1)).toEqual({ ...second, active: false })
        await field.setValue('Отправляю')
        const third = commands().at(-1)
        await wrapper.get('form').trigger('submit')
        expect(commands().slice(-2)).toEqual([
            { ...third, active: false },
            { type: 'whisper', targetId: 'partner', text: 'Отправляю' },
        ])
        await field.setValue('Последний черновик')
        const fourth = commands().at(-1)
        wrapper.unmount()
        expect(commands().at(-1)).toEqual({ ...fourth, active: false })
    } finally {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
})

it('stops the old partner scope and clears the draft when the conversation changes or loses reach', async () => {
    const wrapper = mount(PrivateConversation, {
        props: { conversation: whisperFixture(), playerId: 'self' },
    })
    const commands = () =>
        ((wrapper.emitted('command') ?? []) as Array<[ClientMessage]>).map(([message]) => message)
    try {
        await wrapper.get('input').setValue('Для Капли')
        const original = commands()[0]
        await wrapper.setProps({ conversation: { ...whisperFixture(), partnerId: 'other' } })
        expect(commands().at(-1)).toEqual({ ...original, active: false })
        expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
        await wrapper.get('input').setValue('Для другого')
        expect(commands().at(-1)).toMatchObject({ targetId: 'other', active: true })
        await wrapper.setProps({
            conversation: { ...whisperFixture(), partnerId: 'other', available: false },
        })
        expect(commands().at(-1)).toMatchObject({ targetId: 'other', active: false })
    } finally {
        wrapper.unmount()
    }
})

it('preserves reading position on new messages and scrolls only when already at the bottom', async () => {
    const wrapper = mount(PrivateConversation, {
        props: { conversation: whisperFixture(), playerId: 'self' },
    })
    try {
        const list = wrapper.get('.private-conversation__history')
        const element = list.element as HTMLElement
        let height = 1000
        Object.defineProperties(element, {
            scrollHeight: { get: () => height },
            clientHeight: { get: () => 100 },
        })
        element.scrollTop = 100
        await list.trigger('scroll')
        await wrapper.setProps({
            conversation: {
                ...whisperFixture(),
                messages: [
                    ...whisperFixture().messages,
                    { id: '2', senderId: 'partner', text: 'Новое сообщение', at: 200 },
                ],
            },
        })
        await wrapper.vm.$nextTick()
        expect(element.scrollTop).toBe(100)
        expect(wrapper.find('.private-conversation__unread').exists()).toBe(true)
        await wrapper.get('.private-conversation__unread').trigger('click')
        expect(element.scrollTop).toBe(1000)
        element.scrollTop = 900
        await list.trigger('scroll')
        height = 1100
        await wrapper.setProps({
            conversation: {
                ...whisperFixture(),
                messages: [
                    ...whisperFixture().messages,
                    { id: '3', senderId: 'partner', text: 'Ещё сообщение', at: 300 },
                ],
            },
        })
        await wrapper.vm.$nextTick()
        expect(element.scrollTop).toBe(1100)
    } finally {
        wrapper.unmount()
    }
})
