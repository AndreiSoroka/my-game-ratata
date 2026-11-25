import type {
    QuestRewardRequest,
    QuestRewardResult,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    guildRewardAssets,
    type GuildRewardEnvironment,
    guildRewardUnchanged,
} from './guildRewards'
import {
    type GuildJob,
    resetSubmitterMartyr,
    rewardEligible,
} from './guildRules'
import {
    checkWorkerTurnIn,
    refreshWorkerJob,
    type WorkerGuildGateway,
} from './guildWorkerRequests'
import { planQuestReward, type QuestGoldAwarder } from './questRewards'

export interface GuildSettlement {
    job: GuildJob
    key: string
    submitterId: string
    members: Set<string>
    characters: Map<string, GameCharacter>
    award: QuestGoldAwarder
    now: number
    rewards?: GuildRewardEnvironment | undefined
    workers?: WorkerGuildGateway | undefined
}

function rewardAvailable(input: GuildSettlement): boolean {
    const { job, characters, submitterId, rewards } = input
    if (job.reward === undefined) {
        return true
    }
    return (
        characters.has(submitterId) &&
        rewards !== undefined &&
        guildRewardUnchanged(job.reward) &&
        rewards.funding.reservations.valid(job.id)
    )
}

function payout(
    input: GuildSettlement,
    request: QuestRewardRequest
): QuestRewardResult {
    const { job, characters, rewards, workers, key, award } = input
    const promise = job.reward
    const submitter = characters.get(input.submitterId)
    const shares = planQuestReward(request, promise !== undefined)
    if (shares === undefined) {
        return { ok: false, shares: [] }
    }
    const outcome: { result: QuestRewardResult } = {
        result: { ok: false, shares: [] },
    }
    const settle = () => {
        outcome.result = award(
            request,
            promise !== undefined &&
                submitter !== undefined &&
                rewards !== undefined
                ? {
                      assets: guildRewardAssets(
                          promise,
                          job.id,
                          shares,
                          submitter,
                          rewards.walletFor
                      ),
                  }
                : undefined
        )
        return outcome.result.ok
    }
    const paid =
        job.definition.workRequest === undefined
            ? settle()
            : workers?.settle?.(job.definition.id, key, settle) === true
    return paid ? outcome.result : { ok: false, shares: [] }
}

export function settleGuildJob(input: GuildSettlement): string | null {
    const { job, workers, key, now, characters, members, submitterId } = input
    if (
        !refreshWorkerJob(workers, job, key) ||
        job.progress < job.definition.goal
    ) {
        return 'Условия договора ещё не выполнены.'
    }
    const error = checkWorkerTurnIn(workers, job, key, now)
    if (error !== null) {
        return error
    }
    if (!rewardAvailable(input)) {
        return 'Обещанная награда недоступна. Можно дождаться её или оставить договор.'
    }
    const result = payout(input, {
        receiptId: job.id,
        totalGold: job.definition.rewardGold,
        mode: job.rewardMode,
        submitterId,
        memberIds: [...members].filter((id) =>
            rewardEligible(id, members, characters.get(id))
        ),
    })
    if (!result.ok) {
        return 'Передача награды не состоялась. Проверьте её наличие и вместимость сумки.'
    }
    job.rewardShares = result.shares
    resetSubmitterMartyr(characters, submitterId)
    job.completed = true
    if (job.definition.workRequest !== undefined) {
        job.definition = {
            ...job.definition,
            workRequest: { ...job.definition.workRequest, stage: 'completed' },
        }
    }
    return null
}
