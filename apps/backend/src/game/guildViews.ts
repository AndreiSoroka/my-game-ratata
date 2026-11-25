import {
    type GuildQuestDefinition,
    type GuildQuestSnapshot,
    npcQuestMessage,
} from '@my-game-ratata/contracts'

import { guildRewardUnchanged } from './guildRewards'
import type { GuildJob } from './guildRules'
import type { WorkerGuildGateway } from './guildWorkerRequests'
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
    const rewardNotice = missing
        ? 'Обещанная награда недоступна. Можно дождаться её или оставить договор.'
        : (job.rewardNotice ?? null)
    const rewardNoticeMessage = npcQuestMessage(rewardNotice)
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
                  rewardNotice,
                  ...(rewardNoticeMessage === undefined
                      ? {}
                      : { rewardNoticeMessage }),
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

export function viewActiveGuildJob(
    job: GuildJob,
    key: string,
    workers: WorkerGuildGateway | undefined,
    funding: QuestFunding | undefined
): GuildQuestSnapshot | undefined {
    if (job.definition.workRequest === undefined) {
        return viewGuildJob(job, funding)
    }
    const request = workers?.active(key, job.definition.id)
    return request == null
        ? undefined
        : viewGuildJob(
              {
                  ...job,
                  definition: { ...job.definition, workRequest: request },
                  progress: request.stage === 'ready' ? job.definition.goal : 0,
              },
              funding
          )
}

export function viewGuildHistory(
    history: Iterable<GuildJob>,
    active: ReadonlySet<string>,
    issuerId: string,
    personId: string,
    funding: QuestFunding | undefined
): GuildQuestSnapshot[] {
    return [...history]
        .filter(
            (job) =>
                (issuerId === '' || job.issuerId === issuerId) &&
                (active.has(job.id) ||
                    ((job.completed || job.cancelled === true) &&
                        (job.acceptedBy === personId ||
                            job.participants.has(personId))))
        )
        .map((job) => viewGuildJob(job, funding))
}

export function availableGuildDefinitions(
    definitions: GuildQuestDefinition[],
    completed: ReadonlySet<string> | undefined,
    active: ReadonlySet<string>
): GuildQuestDefinition[] {
    return definitions.filter(
        (job) =>
            !active.has(job.id) &&
            (job.workRequest === undefined
                ? completed?.has(job.id) !== true
                : job.workRequest.stage === 'waiting')
    )
}
