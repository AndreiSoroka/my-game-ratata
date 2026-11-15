import type { GuildQuestSnapshot, PartySnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import GuildWindow from './GuildWindow.vue'

function party(activeJob: GuildQuestSnapshot | null): PartySnapshot {
    return {
        partyId: null,
        leaderId: null,
        members: [],
        invitations: [],
        jobs: [],
        activeJob,
        guildContact: { npcId: 'local-clerk', nickname: 'Распорядитель' },
        notice: null,
    }
}
describe('guild task instructions and rewards', () => {
    it('keeps contribution as objective statistics without denying late members a share', () => {
        const job = guildQuestFixture({
            participants: [
                { id: 'early', nickname: 'Ранний', eligible: true, contribution: 0 },
                { id: 'late', nickname: 'Поздний', eligible: false, contribution: 0 },
            ],
        })
        const wrapper = mount(GuildWindow, {
            props: { player: characterFixture('self'), characters: [], party: party(job) },
        })
        try {
            expect(wrapper.get('.quest-card label').text()).toContain(
                'Побеждено враждебных слизней: 2 / 3'
            )
            expect(wrapper.text()).toContain('Сердца и другие предметы сдавать не нужно')
            expect(wrapper.text()).toContain('включая вступивших позже')
            expect(wrapper.text()).toContain('Общая награда: 30 золотых')
            expect(wrapper.text()).not.toContain('Без награды')
            expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0)
        } finally {
            wrapper.unmount()
        }
    })

    it('addresses payout to the exact accepted contract and uses server-projected contact', async () => {
        const activeJob = guildQuestFixture({ id: 'survey_frontier', status: 'ready', progress: 3 })
        const wrapper = mount(GuildWindow, {
            props: { player: characterFixture('self'), characters: [], party: party(activeJob) },
        })
        try {
            expect(wrapper.get('.quest-card label').text()).toContain(
                'Исследовано разных земель: 3 / 3'
            )
            await wrapper.get('.guild-reward button').trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'guild_turn_in', instanceId: 'guild-contract-1' }],
            ])
            await wrapper.setProps({
                party: { ...party(activeJob), guildContact: null },
                characters: [characterFixture('npc_friendly_girl_1')],
            })
            expect(wrapper.get('.guild-reward button').attributes('disabled')).toBeDefined()
        } finally {
            wrapper.unmount()
        }
    })

    it('sends the chosen reward mode only with acceptance', async () => {
        const snapshot = { ...party(null), jobs: [guildQuestFixture()] }
        const wrapper = mount(GuildWindow, {
            props: { player: characterFixture('self'), characters: [], party: snapshot },
        })
        try {
            expect(wrapper.get('input[value="party_equal"]').element).toHaveProperty(
                'checked',
                true
            )
            await wrapper.get('input[value="submitter"]').setValue()
            await wrapper.get('.guild-job > button').trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'guild_accept', questId: 'slime_hunt', rewardMode: 'submitter' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })

    it('shows the reported enemy, reusable proof and the current worker trip stage', async () => {
        const job = guildQuestFixture({ id: 'work-request-1', workRequest: workRequestFixture() })
        const wrapper = mount(GuildWindow, {
            props: { player: characterFixture('self'), characters: [], party: party(job) },
        })
        try {
            expect(wrapper.text()).toContain('Фермер Агафья')
            expect(wrapper.text()).toContain('Северные предместья')
            expect(wrapper.text()).toContain('Скелет')
            expect(wrapper.get('.quest-trophy img').attributes('alt')).toBe('Кость')
            await wrapper.get('.quest-card-actions button').trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'guild_report', instanceId: job.instanceId }],
            ])
            await wrapper.setProps({
                party: party({ ...job, workRequest: workRequestFixture({ proofAccepted: true }) }),
            })
            expect(wrapper.text()).toContain('Повторные пробные рейсы бесплатны')
            expect(wrapper.get('.quest-card-actions button').text()).toBe('Повторить пробный рейс')
            await wrapper.setProps({
                party: party({
                    ...job,
                    workRequest: workRequestFixture({
                        proofAccepted: true,
                        stage: 'working',
                        reason: 'Дождитесь созревания пшеницы.',
                    }),
                }),
            })
            expect(wrapper.text()).toContain('Работник пробует работать')
            expect(wrapper.get('[role="status"]').text()).toContain('Дождитесь созревания')
            expect(wrapper.findAll('.quest-card-actions button')).toHaveLength(1)
        } finally {
            wrapper.unmount()
        }
    })
    it('offers a worker request only at its authored clerk', () => {
        const wrapper = mount(GuildWindow, {
            props: {
                player: characterFixture('self'),
                characters: [],
                party: {
                    ...party(null),
                    jobs: [guildQuestFixture({ workRequest: workRequestFixture() })],
                },
            },
        })
        try {
            expect(wrapper.get('.guild-job > button').attributes('disabled')).toBeDefined()
            expect(wrapper.text()).toContain('Подойдите к распорядителю этого обращения')
        } finally {
            wrapper.unmount()
        }
    })
})

describe('remote worker request abandonment', () => {
    it('lets a living leader abandon without a clerk and disables other members', async () => {
        const job = guildQuestFixture({ workRequest: workRequestFixture({ stage: 'working' }) })
        const snapshot = { ...party(job), guildContact: null }
        const wrapper = mount(GuildWindow, {
            props: { player: characterFixture('self'), characters: [], party: snapshot },
        })
        try {
            const abandon = wrapper.get('.quest-card-actions button')
            expect(abandon.text()).toBe('Отказаться от обращения')
            expect(abandon.attributes('disabled')).toBeUndefined()
            await abandon.trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'guild_abandon', instanceId: job.instanceId }],
            ])
            await wrapper.setProps({ party: { ...snapshot, leaderId: 'other' } })
            expect(abandon.attributes('disabled')).toBeDefined()
            await wrapper.setProps({
                party: snapshot,
                player: characterFixture('self', { alive: false }),
            })
            expect(abandon.attributes('disabled')).toBeDefined()
        } finally {
            wrapper.unmount()
        }
    })
})
