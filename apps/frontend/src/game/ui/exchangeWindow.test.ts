import type { ClientMessage, ExchangeSnapshot } from '@my-game-ratata/contracts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ExchangeWindow from './ExchangeWindow.vue'
import { exchangeFixture, whisperFixture } from './socialFixtures'

function setup(exchange: ExchangeSnapshot = exchangeFixture()) {
    return mount(ExchangeWindow, {
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
function button(wrapper: VueWrapper, label: string) {
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
        expect(wrapper.get('img[alt="Яблоко"]').attributes('src')).toContain('Item__64.png')
        expect(wrapper.get('.trade-item-editor').text()).toContain('В сумке 5')
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
        expect(button(wrapper, 'Предложить').attributes('disabled')).toBeUndefined()
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeDefined()
        await button(wrapper, 'Предложить').trigger('click')
        const request = proposal(wrapper)
        expect(request).toMatchObject({
            revision: 1,
            items: [{ instanceId: 'grain-1', quantity: 2 }],
            gold: 0,
            requestId: expect.any(String),
        })
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeDefined()
        // A resource revision is not an acknowledgement of the outstanding request.
        await wrapper.setProps({
            exchange: exchangeFixture({
                revision: 3,
                own: { ...exchangeFixture().own, revision: 2 },
            }),
        })
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
        expect(button(wrapper, 'Подтвердить').attributes('disabled')).toBeUndefined()
        await button(wrapper, 'Подтвердить').trigger('click')
        expect(commands(wrapper).at(-1)).toEqual({
            type: 'exchange_accept',
            exchangeId: 'exchange-1',
            revision: 4,
        })
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
        expect(wrapper.get('.trade-item-editor').text()).toContain('свободно 3')
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
        await button(wrapper, 'Убрать вещи').trigger('click')
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
        expect(button(wrapper, 'Изменить предложение').attributes('disabled')).toBeDefined()
        await wrapper.setProps({
            exchange: { ...exchange, own: { ...exchange.own, accepted: true } },
        })
        expect(wrapper.find('[aria-label="Вы: подтверждено"]').exists()).toBe(true)
        expect(wrapper.find('.exchange-own-items').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Предложить золото"]').exists()).toBe(false)
        await button(wrapper, 'Изменить предложение').trigger('click')
        expect(commands(wrapper).at(-1)).toEqual({
            type: 'exchange_decline',
            exchangeId: 'exchange-1',
            revision: 2,
            reason: 'Хочу изменить предложение.',
        })
        expect(wrapper.find('#exchange-grain-1').exists()).toBe(false)
        expect(button(wrapper, 'Изменить предложение').attributes('disabled')).toBeDefined()
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
        await wrapper.get('#exchange-grain-1').setValue(3)
        await wrapper.setProps({
            exchange: { ...exchange, own: { ...exchange.own, accepted: true } },
        })
        const own = wrapper.get('[aria-label="Вы"]')
        expect(own.find('input').exists()).toBe(false)
        expect(own.get('img').attributes('alt')).toBe('Зерно')
        expect(wrapper.find('[aria-label="Вы: подтверждено"]').exists()).toBe(true)
        await button(wrapper, 'Изменить предложение').trigger('click')
        await wrapper.setProps({ exchange })
        expect((wrapper.get('#exchange-grain-1').element as HTMLInputElement).value).toBe('3')
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
