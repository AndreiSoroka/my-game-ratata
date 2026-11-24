import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import QuestTurnInWindow from './QuestTurnInWindow.vue'
import { questTurnInFixture } from './socialFixtures'

const prompt = questTurnInFixture()

it('requires an explicit button, confirms the server prompt once and blocks repeated activation', async () => {
    const view = mount(QuestTurnInWindow, { props: { prompt, serverTime: 1000, playerId: 'self' } })
    try {
        expect(view.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
        expect(view.get('img').attributes('alt')).toBe('Яблоко')
        await view.get('[role="dialog"]').trigger('keydown', { code: 'Enter' })
        expect(view.emitted('command')).toBeUndefined()
        const take = view.findAll('button').find((button) => button.text() === 'Сдать')!
        await take.trigger('click')
        await take.trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'quest_turn_in_confirm', confirmationId: 'confirm-1', accept: true }],
        ])
    } finally {
        view.unmount()
    }
})
it('disables an expired prompt and closes through the same explicit confirmation protocol', async () => {
    const view = mount(QuestTurnInWindow, {
        props: { prompt, serverTime: prompt.expiresAt, playerId: 'self' },
    })
    try {
        const take = view.findAll('button').find((button) => button.text() === 'Сдать')!
        expect(take.attributes('disabled')).toBeDefined()
        await view
            .findAll('button')
            .find((button) => button.text() === 'Вернуться к разговору')!
            .trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'quest_turn_in_confirm', confirmationId: 'confirm-1', accept: false }],
        ])
    } finally {
        view.unmount()
    }
})

it('labels a worker report and waits for explicit confirmation before submitting the trophy', async () => {
    const report = { ...prompt, source: 'guild', action: 'report' } as const
    const view = mount(QuestTurnInWindow, {
        props: { prompt: report, serverTime: 1000, playerId: 'self' },
    })
    try {
        expect(view.text()).toContain('Награду выдадут после проверочного рейса')
        expect(view.emitted('command')).toBeUndefined()
        await view
            .findAll('button')
            .find((button) => button.text() === 'Передать трофей и доложить')!
            .trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'quest_turn_in_confirm', confirmationId: report.id, accept: true }],
        ])
    } finally {
        view.unmount()
    }
})
