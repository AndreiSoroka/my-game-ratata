import '../ui/rpgControls.css'
import '../ui/adventurePanel.css'

import type { GuildQuestSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import GuildQuestCard from '../ui/GuildQuestCard.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/Quests' } satisfies Meta
export default meta
type Story = StoryObj

function questCard(job: GuildQuestSnapshot): HTMLElement {
    const host = renderVueStory(GuildQuestCard, {
        job,
        playerId: 'self',
        canAct: true,
        canAbandon: true,
    })
    host.classList.add('adventure-ui')
    return host
}

export const AwaitingProof: Story = {
    render: () =>
        questCard(
            guildQuestFixture({
                id: 'work-request-1',
                title: 'Помочь фермеру вернуться к работе',
                description: 'На ферме появились скелеты. Агафья ждёт помощи у распорядителя.',
                workRequest: workRequestFixture(),
            })
        ),
}

export const TrialBlocked: Story = {
    render: () =>
        questCard(
            guildQuestFixture({
                id: 'work-request-1',
                title: 'Помочь фермеру вернуться к работе',
                description: 'Работник проверяет возможность безопасно работать.',
                workRequest: workRequestFixture({
                    stage: 'working',
                    proofAccepted: true,
                    reason: 'Пшеница ещё растёт. Работник дождётся настоящего урожая.',
                }),
            })
        ),
}

export const SharedReward: Story = {
    render: () =>
        questCard(
            guildQuestFixture({
                status: 'completed',
                progress: 3,
                rewardShares: [
                    { characterId: 'self', gold: 15 },
                    { characterId: 'late', gold: 15 },
                ],
            })
        ),
}
