import type {
    GuildQuestDefinition,
    QuestRewardMode,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ContractSlots } from './contractSlots'
import {
    type GuildRewardEnvironment,
    type GuildRewardPromise,
    type NegotiatedWorkerReward,
    reserveWorkerReward,
} from './guildRewards'
import { createGuildParticipants, type GuildJob } from './guildRules'
import { acceptWorkerJob, type WorkerGuildGateway } from './guildWorkerRequests'

export interface GuildAcceptance {
    key: string
    id: string
    definition: GuildQuestDefinition
    leader: string
    members: Set<string>
    characters: Map<string, GameCharacter>
    rewardMode: QuestRewardMode
    now: number
    terms?: NegotiatedWorkerReward | undefined
    issuerId?: string | undefined
    rewards?: GuildRewardEnvironment | undefined
    workers?: WorkerGuildGateway | undefined
    slots: ContractSlots
    reporter?: GameCharacter | undefined
}

function reserve(
    input: GuildAcceptance
): GuildRewardPromise | string | undefined {
    if (input.definition.workRequest === undefined) {
        return undefined
    }
    if (input.rewards === undefined) {
        return 'Городской фонд обращения недоступен.'
    }
    return reserveWorkerReward(
        input.rewards.funding,
        input.id,
        input.definition,
        input.characters,
        input.terms
    )
}

function createJob(
    input: GuildAcceptance,
    reward?: GuildRewardPromise
): GuildJob {
    const issuer = reward?.issuer ?? input.characters.get(input.issuerId ?? '')
    return {
        acceptedBy: input.leader,
        completed: false,
        definition: {
            ...structuredClone(input.definition),
            rewardGold: reward?.gold ?? input.definition.rewardGold,
        },
        rewardMode: input.rewardMode,
        id: input.id,
        ...(issuer === undefined
            ? {}
            : { issuerId: issuer.id, issuerName: issuer.nickname }),
        ...(reward === undefined ? {} : { reward }),
        participants: createGuildParticipants(input.members, input.characters),
        progress: 0,
        visited: new Set(),
    }
}

/** Reserve every promised asset before claiming the world incident. */
export function acceptGuildJob(input: GuildAcceptance): GuildJob | string {
    const { id, definition, characters, rewards, workers, key, members, now } =
        input
    const reward = reserve(input)
    if (typeof reward === 'string') {
        return reward
    }
    const error = acceptWorkerJob(
        workers,
        definition,
        key,
        members,
        characters,
        now
    )
    if (error !== null) {
        rewards?.funding.reservations.release(id)
        return error
    }
    if (!input.slots.claim(key, id)) {
        rewards?.funding.reservations.release(id)
        workers?.releaseGroup(key, now)
        return 'У группы уже есть действующий договор.'
    }
    return input.reporter === undefined
        ? createJob(input, reward)
        : acceptAndReport(input, reward, input.reporter)
}

function acceptAndReport(
    input: GuildAcceptance,
    reward: GuildRewardPromise | undefined,
    reporter: GameCharacter
): GuildJob | string {
    const { workers, definition, key, now, slots, id, rewards } = input
    const error = workers?.report(definition.id, key, reporter, now)
    if (error === null) {
        return createJob(input, reward)
    }
    workers?.releaseGroup(key, now)
    rewards?.funding.reservations.release(id)
    slots.release(id)
    return error ?? 'Обращение недоступно.'
}
