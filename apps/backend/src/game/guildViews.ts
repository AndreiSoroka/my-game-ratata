import type { GuildQuestSnapshot } from '@my-game-ratata/contracts'

import { guildRewardUnchanged } from './guildRewards'
import type { GuildJob } from './guildRules'
import type { QuestFunding } from './questFunding'

function rewardMissing(job: GuildJob, funding?: QuestFunding): boolean {
    if (job.reward === undefined || job.completed || job.cancelled === true) {
        return false
    }
    return (
        !guildRewardUnchanged(job.reward) ||
        funding?.reservations.valid(job.id) !== true
    )
}

function status(job: GuildJob, missing: boolean): GuildQuestSnapshot['status'] {
    if (job.cancelled === true) {
        return 'cancelled'
    }
    if (job.completed) {
        return 'completed'
    }
    if (missing) {
        return 'reward_missing'
    }
    return job.progress >= job.definition.goal ? 'ready' : 'active'
}

export function viewGuildJob(
    job: GuildJob,
    funding?: QuestFunding
): GuildQuestSnapshot {
    const missing = rewardMissing(job, funding)
    return {
        ...job.definition,
        instanceId: job.id,
        rewardMode: job.rewardMode,
        ...(job.issuerId === undefined ? {} : { issuerId: job.issuerId }),
        ...(job.issuerName === undefined ? {} : { issuerName: job.issuerName }),
        ...(job.reward === undefined
            ? {}
            : {
                  rewardItems: structuredClone(job.reward.snapshots),
                  itemRecipient: 'submitter' as const,
                  fundingCityId: job.reward.cityId,
                  rewardStatus: missing
                      ? ('missing' as const)
                      : ('reserved' as const),
                  rewardNotice: missing
                      ? 'Обещанная награда недоступна. Можно дождаться её или оставить договор.'
                      : (job.rewardNotice ?? null),
              }),
        ...(job.completed ? { receiptId: job.id } : {}),
        ...(job.rewardShares === undefined
            ? {}
            : { rewardShares: job.rewardShares }),
        participants: [...job.participants].map(([id, entry]) => ({
            id,
            nickname: entry.nickname,
            contribution: entry.contribution,
            eligible: entry.eligible,
        })),
        progress: job.progress,
        status: status(job, missing),
    }
}
