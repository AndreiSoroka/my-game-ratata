import type { QuestTurnInPromptSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import QuestTurnInWindow from './QuestTurnInWindow.vue'
import { questTurnInFixture } from './socialFixtures'

const prompt = questTurnInFixture()

it('requires an explicit button, confirms the server prompt once and blocks repeated activation', async () => {
    const view = mount(QuestTurnInWindow, {
        props: {
            prompt: {
                ...prompt,
                objectives: [{ kind: 'deliver', itemId: 'bone', quantity: 2, recipientId: 'mira' }],
                objectiveLabels: ['Передайте трофеи Мире.'],
            },
            serverTime: 1000,
            playerId: 'self',
        },
    })
    try {
        expect(view.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
        expect(view.get('[aria-label="Нужные предметы"]').text()).toBe('Кость × 2')
        expect(view.get('[aria-label="Награда:"]').text()).toBe('Яблоко × 1')
        expect(view.text()).toContain('Передайте трофеи Мире.')
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
    const report: QuestTurnInPromptSnapshot = {
        ...prompt,
        source: 'guild',
        action: 'report',
        objectives: [{ kind: 'deliver', itemId: 'bone', quantity: 1, recipientId: 'mira' }],
    }
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

it('lets the player choose the reward mode for a delivery without separate acceptance', async () => {
    const view = mount(QuestTurnInWindow, {
        props: { prompt: { ...prompt, preAcceptance: true }, serverTime: 1000, playerId: 'self' },
    })
    try {
        await view.get('input[value="submitter"]').setValue()
        expect(view.emitted('command')).toBeUndefined()
        await view
            .findAll('button')
            .find((button) => button.text() === 'Сдать')!
            .trigger('click')
        expect(view.emitted('command')).toEqual([
            [
                {
                    type: 'quest_turn_in_confirm',
                    confirmationId: prompt.id,
                    accept: true,
                    rewardMode: 'submitter',
                },
            ],
        ])
    } finally {
        view.unmount()
    }
})

it('offers another worker verification with the previously supplied trophy', () => {
    const view = mount(QuestTurnInWindow, {
        props: {
            prompt: { ...prompt, source: 'guild', action: 'report', objectives: [] },
            serverTime: 1000,
            playerId: 'self',
        },
    })
    try {
        expect(view.find('[aria-label="Нужные предметы"]').exists()).toBe(false)
        expect(view.findAll('button').map((button) => button.text())).toContain(
            'Повторить пробный рейс'
        )
    } finally {
        view.unmount()
    }
})
