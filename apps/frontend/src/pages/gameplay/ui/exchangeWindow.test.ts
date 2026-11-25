import type { ClientMessage, ExchangeSnapshot } from '@my-game-ratata/contracts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { characterFixture } from '@/game/testing/characterFixture'
import { exchangeFixture, whisperFixture } from '@/game/testing/socialFixtures'

import ExchangeWindow from './ExchangeSessionWindow.vue'

function setup(exchange: ExchangeSnapshot = exchangeFixture(), attachTo?: HTMLElement) {
    return mount(ExchangeWindow, {
        attachTo,
        props: {
            exchange,
            gold: 15,
            conversation: whisperFixture(),
            player: characterFixture('self', {
                inventory: [
                    { instanceId: 'grain-1', itemId: 'grain', quantity: 5 },
                    { instanceId: 'food-2', itemId: 'food' },
                ],
            }),
        },
    })
}
function button(wrapper: Pick<VueWrapper, 'findAll'>, label: string) {
    const found = wrapper.findAll('button').find((entry) => entry.text() === label)
    if (!found) {
        throw new Error(`Missing button: ${label}`)
    }
    return found
}
function commands(wrapper: VueWrapper): ClientMessage[] {
    return ((wrapper.emitted('command') ?? []) as Array<[ClientMessage]>).map(
        ([message]) => message
    )
}
function proposal(wrapper: VueWrapper) {
    const message = commands(wrapper)
        .reverse()
        .find((entry) => entry.type === 'exchange_offer')
    if (message?.type !== 'exchange_offer') {
        throw new Error('Missing proposal')
    }
    return message
}
it('uses two independent participant statuses and real item images', async () => {
    const wrapper = setup()
    try {
        expect(wrapper.findAll('.exchange-consent')).toHaveLength(2)
        expect(wrapper.find('[aria-label="Вы: не подтверждено"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Капля: не подтверждено"]').exists()).toBe(true)
        expect(wrapper.get('.ui-item-slot img[alt="Яблоко"]').attributes('src')).toContain(
            'Item__64.png'
        )
        expect(wrapper.get('.exchange-draft-row').text()).toContain('В сумке 5')
        await wrapper.setProps({
            exchange: exchangeFixture({ own: { ...exchangeFixture().own, accepted: true } }),
        })
        expect(wrapper.find('[aria-label="Вы: подтверждено"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Капля: не подтверждено"]').exists()).toBe(true)
    } finally {
        wrapper.unmount()
    }
})
it('proposes a draft with own revision, waits for exact acknowledgement and confirms the global revision', async () => {
    const wrapper = setup()
    try {
        const field = wrapper.get('#exchange-grain-1')
        ;(field.element as HTMLInputElement).value = '2'
        await field.trigger('input')
        const propose = button(wrapper.get('.exchange-draft-pane__actions'), 'Предложить')
        expect(propose.attributes('disabled')).toBeUndefined()
        expect(
            button(wrapper.get('.exchange-actions'), 'Подтвердить').attributes('disabled')
        ).toBeDefined()
        await propose.trigger('click')
        const request = proposal(wrapper)
        expect(request).toMatchObject({
            revision: 1,
            items: [{ instanceId: 'grain-1', quantity: 2 }],
            gold: 0,
            requestId: expect.any(String),
        })
        expect(propose.attributes('aria-disabled')).toBe('true')
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeDefined()
        // An unrelated acknowledgement cannot publish this draft.
        await wrapper.setProps({
            exchange: exchangeFixture({
                revision: 3,
                own: { ...exchangeFixture().own, revision: 2, lastRequestId: 'previous-request' },
            }),
        })
        expect(wrapper.get<HTMLInputElement>('#exchange-grain-1').element.value).toBe('2')
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeDefined()
        await wrapper.setProps({
            exchange: exchangeFixture({
                revision: 4,
                own: {
                    revision: 3,
                    lastRequestId: request.requestId,
                    items: [{ instanceId: 'grain-1', itemId: 'grain', quantity: 2 }],
                    gold: 0,
                    accepted: false,
                },
            }),
        })
        const own = wrapper.get('[aria-label="Ваше предложение"]')
        const other = wrapper.get('[aria-label="Капля"]')
        expect(own.find('input').exists()).toBe(false)
        expect(own.get('.exchange-offer__item').text()).toMatch(/Зерно\s*× 2/)
        expect(own.get('.exchange-offer__item .ui-item-slot img').attributes('src')).toContain(
            'grain.svg'
        )
        expect(other.find('.exchange-offer__item').exists()).toBe(true)
        expect(button(own, 'Изменить предложение').attributes('aria-disabled')).toBeUndefined()
        const confirm = button(wrapper.get('.exchange-actions'), 'Подтвердить')
        expect(confirm.attributes('disabled')).toBeUndefined()
        await confirm.trigger('click')
        expect(commands(wrapper).at(-1)).toEqual({
            type: 'exchange_accept',
            exchangeId: 'exchange-1',
            revision: 4,
        })
    } finally {
        wrapper.unmount()
    }
})
it('publishes and resends a proposal without randomUUID and keeps the partner confirmation', async () => {
    const wrapper = setup(exchangeFixture(), document.body)
    try {
        vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
        expect(button(wrapper, 'Предложить').attributes('disabled')).toBeDefined()
        await wrapper.get('#exchange-grain-1').setValue(2)
        await wrapper.get('[aria-label="Предложить золото"]').setValue(7)
        await button(wrapper, 'Предложить').trigger('click')
        const request = proposal(wrapper)
        const chat = wrapper.get<HTMLInputElement>('.private-conversation input')
        await chat.setValue('В обмен ещё семь монет')
        expect(commands(wrapper)).toContainEqual({
            type: 'speech_activity',
            channel: 'whisper',
            targetId: 'partner',
            active: true,
            activityId: expect.any(String),
        })
        chat.element.focus()
        const published = exchangeFixture({
            revision: 3,
            own: {
                revision: 2,
                lastRequestId: request.requestId,
                items: [{ instanceId: 'grain-1', itemId: 'grain', quantity: 2 }],
                gold: 7,
                accepted: false,
            },
            other: { ...exchangeFixture().other, accepted: true },
        })
        await wrapper.setProps({ exchange: published })
        const own = wrapper.get('[aria-label="Ваше предложение"]')
        expect(own.get('.exchange-offer__gold').text()).toContain('◈ 7')
        expect(document.activeElement).toBe(chat.element)
        expect(chat.element.value).toBe('В обмен ещё семь монет')

        const edit = button(own, 'Изменить предложение')
        edit.element.focus()
        await edit.trigger('click')
        const grain = wrapper.get<HTMLInputElement>('#exchange-grain-1')
        expect(document.activeElement).toBe(grain.element)
        expect(grain.element.value).toBe('2')
        expect(
            wrapper.get<HTMLInputElement>('[aria-label="Предложить золото"]').element.value
        ).toBe('7')
        expect(commands(wrapper).filter((message) => message.type.startsWith('exchange_'))).toEqual(
            [request]
        )
        expect(
            button(wrapper.get('.exchange-actions'), 'Подтвердить').attributes('disabled')
        ).toBeUndefined()

        const propose = button(wrapper, 'Предложить')
        expect(propose.attributes('disabled')).toBeUndefined()
        propose.element.focus()
        await propose.trigger('click')
        const resend = proposal(wrapper)
        expect(resend).toEqual({
            ...request,
            revision: published.own.revision,
            requestId: expect.any(String),
        })
        expect(resend.requestId).not.toBe(request.requestId)
        expect(propose.attributes('aria-disabled')).toBe('true')
        expect(wrapper.find('#exchange-grain-1').exists()).toBe(true)

        await wrapper.setProps({
            exchange: {
                ...published,
                own: { ...published.own, lastRequestId: resend.requestId },
            },
        })
        await nextTick()
        const reviewed = wrapper.get('[aria-label="Ваше предложение"]')
        expect(reviewed.find('input').exists()).toBe(false)
        expect(reviewed.get('.exchange-offer__gold').text()).toContain('◈ 7')
        expect(document.activeElement).toBe(button(reviewed, 'Изменить предложение').element)
        expect(wrapper.find('[aria-label="Капля: подтверждено"]').exists()).toBe(true)
        expect(commands(wrapper).filter((message) => message.type.startsWith('exchange_'))).toEqual(
            [request, resend]
        )
        await button(reviewed, 'Изменить предложение').trigger('click')
        expect(button(wrapper, 'Предложить').attributes('disabled')).toBeUndefined()
    } finally {
        vi.unstubAllGlobals()
        wrapper.unmount()
    }
})
it('focuses the edit action after the focused draft becomes the published proposal', async () => {
    const wrapper = setup(exchangeFixture(), document.body)
    try {
        const quantity = wrapper.get<HTMLInputElement>('#exchange-grain-1')
        await quantity.setValue(2)
        await button(wrapper, 'Предложить').trigger('click')
        const sent = proposal(wrapper)
        quantity.element.focus()
        expect(document.activeElement).toBe(quantity.element)
        await wrapper.setProps({
            exchange: exchangeFixture({
                revision: 3,
                own: {
                    revision: 2,
                    lastRequestId: sent.requestId,
                    items: [{ instanceId: 'grain-1', itemId: 'grain', quantity: 2 }],
                    gold: 0,
                    accepted: false,
                },
            }),
        })
        await nextTick()
        const own = wrapper.get('[aria-label="Ваше предложение"]')
        expect(document.activeElement).toBe(button(own, 'Изменить предложение').element)
    } finally {
        wrapper.unmount()
    }
})
it('retains unsaved edits across repeated snapshots, partner revisions and edits made while proposing', async () => {
    const wrapper = setup()
    try {
        await wrapper.get('#exchange-grain-1').setValue(2)
        await wrapper.get('[aria-label="Предложить золото"]').setValue(7)
        for (let revision = 3; revision <= 7; revision += 1) {
            await wrapper.setProps({
                exchange: exchangeFixture({
                    revision,
                    other: { revision, items: [], gold: revision, accepted: false },
                }),
            })
        }
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('2')
        expect(
            (wrapper.get('[aria-label="Предложить золото"]').element as HTMLInputElement).value
        ).toBe('7')
        await button(wrapper, 'Предложить').trigger('click')
        const request = proposal(wrapper)
        await wrapper.get('#exchange-grain-1').setValue(3)
        await wrapper.setProps({
            exchange: exchangeFixture({
                revision: 8,
                own: {
                    revision: 2,
                    lastRequestId: request.requestId,
                    items: [{ instanceId: 'grain-1', itemId: 'grain', quantity: 2 }],
                    gold: 7,
                    accepted: false,
                },
            }),
        })
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('3')
        expect(button(wrapper, 'Предложить').attributes('disabled')).toBeUndefined()
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeDefined()
    } finally {
        wrapper.unmount()
    }
})
it('edits only real free quantities, keeps gold separate and supports bulk and per-item controls', async () => {
    const wrapper = setup(
        exchangeFixture({
            ownAvailability: {
                gold: 8,
                items: [
                    { instanceId: 'grain-1', quantity: 3 },
                    { instanceId: 'food-2', quantity: 1 },
                ],
            },
        })
    )
    try {
        expect(wrapper.get('.exchange-draft-row').text()).toContain('свободно 3')
        await wrapper.get('[aria-label="Больше: Зерно"]').trigger('click')
        await wrapper.get('[aria-label="Всё: Зерно"]').trigger('click')
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('3')
        await wrapper.get('[aria-label="Убрать: Зерно"]').trigger('click')
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('0')
        await button(wrapper, 'Все вещи').trigger('click')
        expect((wrapper.get('#exchange-food-2').element as HTMLInputElement).value).toBe('1')
        await wrapper.get('[aria-label="Всё золото"]').trigger('click')
        expect(
            (wrapper.get('[aria-label="Предложить золото"]').element as HTMLInputElement).value
        ).toBe('8')
        const clear = button(wrapper.get('.exchange-draft-pane__actions'), 'Очистить')
        expect(clear.attributes('aria-label')).toBe('Убрать вещи')
        await clear.trigger('click')
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('0')
        expect(
            (wrapper.get('[aria-label="Предложить золото"]').element as HTMLInputElement).value
        ).toBe('8')
        await wrapper.get('[aria-label="Убрать золото"]').trigger('click')
        expect(
            (wrapper.get('[aria-label="Предложить золото"]').element as HTMLInputElement).value
        ).toBe('0')
    } finally {
        wrapper.unmount()
    }
})
it('keeps chat Enter separate from proposals and confirmation', async () => {
    const wrapper = setup()
    try {
        await wrapper.get('.private-conversation input').setValue('Отдашь бесплатно?')
        await wrapper
            .get('.private-conversation input')
            .trigger('keydown', { code: 'Enter', key: 'Enter' })
        await wrapper.get('.private-conversation form').trigger('submit')
        expect(commands(wrapper).filter((entry) => entry.type !== 'speech_activity')).toEqual([
            { type: 'whisper', targetId: 'partner', text: 'Отдашь бесплатно?' },
        ])
        expect(commands(wrapper).some((entry) => entry.type === 'exchange_accept')).toBe(false)
    } finally {
        wrapper.unmount()
    }
})
it('prevents a held confirmation key from accepting changed conditions again', async () => {
    const wrapper = setup()
    try {
        const confirm = button(wrapper, 'Подтвердить')
        const held = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            repeat: true,
            bubbles: true,
            cancelable: true,
        })
        confirm.element.dispatchEvent(held)
        expect(held.defaultPrevented).toBe(true)
        expect(commands(wrapper)).toEqual([])
    } finally {
        wrapper.unmount()
    }
})
it('freezes edits immediately on confirmation and withdraws consent before allowing changes again', async () => {
    const exchange = exchangeFixture({
        own: {
            ...exchangeFixture().own,
            items: [{ instanceId: 'grain-1', itemId: 'grain', quantity: 1 }],
        },
    })
    const wrapper = setup(exchange)
    try {
        await button(wrapper, 'Подтвердить').trigger('click')
        expect(wrapper.find('#exchange-grain-1').exists()).toBe(false)
        const own = wrapper.get('[aria-label="Ваше предложение"]')
        const edit = button(own, 'Изменить предложение')
        expect(edit.attributes('aria-disabled')).toBe('true')
        await edit.trigger('click')
        expect(commands(wrapper).map((message) => message.type)).toEqual(['exchange_accept'])
        await wrapper.setProps({
            exchange: { ...exchange, own: { ...exchange.own, accepted: true } },
        })
        expect(wrapper.find('[aria-label="Вы: подтверждено"]').exists()).toBe(true)
        expect(
            button(wrapper.get('.exchange-actions'), 'Подтверждено').attributes('disabled')
        ).toBeDefined()
        expect(wrapper.find('.exchange-own-items').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Предложить золото"]').exists()).toBe(false)
        await button(own, 'Изменить предложение').trigger('click')
        expect(commands(wrapper).at(-1)).toEqual({
            type: 'exchange_decline',
            exchangeId: 'exchange-1',
            revision: 2,
            reason: 'Хочу изменить предложение.',
        })
        expect(wrapper.find('#exchange-grain-1').exists()).toBe(false)
        expect(edit.attributes('aria-disabled')).toBe('true')
        await wrapper.setProps({ exchange })
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('1')
        await wrapper.get('#exchange-grain-1').setValue(2)
        expect(button(wrapper, 'Предложить').attributes('disabled')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})
it('shows actual submitted terms while consented and retains a previously unsent draft for explicit editing', async () => {
    const exchange = exchangeFixture({
        own: {
            ...exchangeFixture().own,
            items: [{ instanceId: 'grain-1', itemId: 'grain', quantity: 1 }],
        },
    })
    const wrapper = setup(exchange)
    try {
        await button(
            wrapper.get('[aria-label="Ваше предложение"]'),
            'Изменить предложение'
        ).trigger('click')
        await wrapper.get('#exchange-grain-1').setValue(3)
        await wrapper.setProps({
            exchange: { ...exchange, own: { ...exchange.own, accepted: true } },
        })
        const own = wrapper.get('[aria-label="Ваше предложение"]')
        expect(own.find('input').exists()).toBe(false)
        const submittedItem = own.get('.exchange-offer__item')
        expect(submittedItem.text()).toContain('Зерно')
        expect(submittedItem.get('.ui-item-slot img').attributes('src')).toContain('grain.svg')
        expect(wrapper.find('[aria-label="Вы: подтверждено"]').exists()).toBe(true)
        await button(wrapper, 'Изменить предложение').trigger('click')
        await wrapper.setProps({ exchange })
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('3')
    } finally {
        wrapper.unmount()
    }
})
it('keeps the published proposal in review when changed terms clear consent', async () => {
    const initial = exchangeFixture()
    const own = {
        ...initial.own,
        items: [{ instanceId: 'grain-1', itemId: 'grain' as const, quantity: 2 }],
        accepted: true,
    }
    const wrapper = setup({ ...initial, own })
    try {
        await wrapper.setProps({
            exchange: exchangeFixture({
                revision: 3,
                own: { ...own, accepted: false },
                other: { ...initial.other, revision: 2, gold: 1 },
            }),
        })
        expect(wrapper.find('.exchange-own-items').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Вы: не подтверждено"]').exists()).toBe(true)
        expect(
            button(wrapper.get('.exchange-actions'), 'Подтвердить').attributes('disabled')
        ).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})
it('keeps a rejected proposal editable after its exact error acknowledgement', async () => {
    const wrapper = setup()
    try {
        await wrapper.get('#exchange-grain-1').setValue(2)
        await button(wrapper, 'Предложить').trigger('click')
        const sent = proposal(wrapper)
        await wrapper.setProps({
            exchange: exchangeFixture({
                own: {
                    ...exchangeFixture().own,
                    lastRequestId: sent.requestId,
                    requestError: 'Свободных вещей недостаточно.',
                },
            }),
        })
        expect(wrapper.text()).toContain('Свободных вещей недостаточно.')
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('2')
        expect(button(wrapper, 'Предложить').attributes('disabled')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})
it('disables an empty exchange while still allowing a gift with one empty side', async () => {
    const wrapper = setup(
        exchangeFixture({ other: { items: [], gold: 0, accepted: false, revision: 1 } })
    )
    try {
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeDefined()
        expect(wrapper.text()).toContain('Добавьте вещь или золото')
        await wrapper.setProps({ exchange: exchangeFixture() })
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})
it('shows one terminal result, starts a new exchange with the same partner and retains conversation history', async () => {
    const wrapper = setup(exchangeFixture({ status: 'completed', notice: 'Обмен завершён.' }))
    try {
        expect(wrapper.findAll('.exchange-terminal')).toHaveLength(1)
        expect(
            wrapper.findAll('p').filter((entry) => entry.text().includes('Обмен завершён'))
        ).toHaveLength(0)
        expect(wrapper.find('.exchange-own-items').exists()).toBe(false)
        await button(wrapper, 'Новый обмен').trigger('click')
        expect(commands(wrapper).at(-1)).toEqual({ type: 'exchange_invite', targetId: 'partner' })
        await wrapper.setProps({ exchange: exchangeFixture({ id: 'exchange-2', revision: 1 }) })
        expect(wrapper.get('.private-conversation__history').text()).toContain('Буль, слушаю.')
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('0')
    } finally {
        wrapper.unmount()
    }
})
