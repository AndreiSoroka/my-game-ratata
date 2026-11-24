import {
    type AdventureQuestSnapshot,
    DEFAULT_QUEST_REWARD_MODE,
    type GuildQuestSnapshot,
    ITEM_DEFINITIONS,
    type LocalizedMessage,
    npcQuestMessage,
    type NpcQuestSnapshot,
    type QuestOfferSnapshot,
    type WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import { adventureNpcRoles, adventureQuest } from './adventureContent'
import type { GameCharacter } from './character'
import type { NpcQuestService } from './npcQuests'
import type { PartyService } from './parties'
import { availableItemQuantity } from './rewardReservations'

export interface QuestConversationEnvironment {
    adventure: AdventureService
    parties: PartyService
    quests: NpcQuestService
    getCharacter: (id: string) => GameCharacter | undefined
}

function workerLabels(request: WorkRequestSnapshot): string[] {
    return [
        request.proofAccepted
            ? 'Трофей принят; повторно приносить его не нужно.'
            : `Передать один трофей: ${ITEM_DEFINITIONS[request.requiredTrophyItemId].name}, распорядителю обращения.`,
        request.stage === 'ready'
            ? 'Работник проверил безопасность и вернулся. Можно получить награду у распорядителя.'
            : (request.reason ??
              `Дождаться проверки работы и возвращения ${request.workerName}.`),
    ]
}

function guildReward(job: GuildQuestSnapshot) {
    return {
        rewardGold: job.rewardGold,
        rewardItems: job.rewardItems ?? [],
        rewardMode: job.rewardMode,
        itemRecipient: 'submitter' as const,
        ...(job.fundingCityId === undefined
            ? {}
            : { fundingCityId: job.fundingCityId }),
        ...(job.receiptId === undefined ? {} : { receiptId: job.receiptId }),
        ...(job.rewardShares === undefined
            ? {}
            : { rewardShares: job.rewardShares }),
    }
}

function issuerName(
    job: GuildQuestSnapshot,
    issuer: GameCharacter | undefined,
    issuerId: string
): string {
    return issuer?.nickname ?? job.issuerName ?? issuerId
}

function questText(
    source: Pick<
        QuestOfferSnapshot,
        'title' | 'description' | 'titleMessage' | 'descriptionMessage'
    >
) {
    const { title, description, titleMessage, descriptionMessage } = source
    return {
        title,
        description,
        ...(titleMessage === undefined ? {} : { titleMessage }),
        ...(descriptionMessage === undefined ? {} : { descriptionMessage }),
    }
}

function questNotice(
    notice: string | null,
    noticeMessage: LocalizedMessage | undefined = npcQuestMessage(notice)
) {
    return {
        notice,
        ...(noticeMessage === undefined ? {} : { noticeMessage }),
    }
}

function storyQuestNotice(quest: AdventureQuestSnapshot, complete: boolean) {
    return complete
        ? questNotice('Награда уже передана.')
        : questNotice(quest.notice ?? null, quest.noticeMessage)
}

function guildContract(
    job: GuildQuestSnapshot,
    issuer: GameCharacter | undefined,
    issuerId: string
): NpcQuestSnapshot {
    const request = job.workRequest
    const notice =
        request !== undefined && !request.proofAccepted
            ? 'Передать трофей клерку и сообщить о расчистке.'
            : (request?.reason ?? null)
    const objectiveLabels =
        request === undefined
            ? [`Прогресс: ${String(job.progress)} / ${String(job.goal)}`]
            : workerLabels(request)
    return {
        id: job.id,
        instanceId: job.instanceId,
        revision: 1,
        issuerId,
        issuerName: issuerName(job, issuer, issuerId),
        ...questText(job),
        objectives:
            request === undefined
                ? []
                : [
                      {
                          kind: 'deliver',
                          itemId: request.requiredTrophyItemId,
                          quantity: 1,
                          recipientId: issuerId,
                      },
                  ],
        objectiveLabels,
        objectiveMessages:
            request === undefined
                ? [
                      {
                          key: 'authored.npc.quest.progress',
                          params: { progress: job.progress, goal: job.goal },
                      },
                  ]
                : objectiveLabels.map(
                      (label) => npcQuestMessage(label) ?? null
                  ),
        ...guildReward(job),
        funding: request === undefined ? 'city' : 'worker',
        expiresAt: 0,
        ...(request === undefined ? {} : { workerRequestId: request.id }),
        progress: [job.progress],
        status: job.status,
        ...questNotice(job.rewardNotice ?? notice, job.rewardNoticeMessage),
    }
}

function storyContract(
    environment: QuestConversationEnvironment,
    issuer: GameCharacter,
    recipient: GameCharacter
): NpcQuestSnapshot | undefined {
    if (adventureNpcRoles[issuer.id]?.quest !== true) {
        return undefined
    }
    const quest = environment.adventure.snapshot(
        recipient.id,
        recipient.locationId,
        recipient
    ).quest
    if (
        quest.status === 'available' ||
        (quest.status === 'cancelled' && quest.accepted !== true)
    ) {
        return undefined
    }
    const instanceId = `story:${recipient.id}:${quest.id}`
    const itemId = quest.requiredItemId ?? adventureQuest.requiredItemId
    const complete = quest.status === 'completed'
    const quantity = availableItemQuantity(recipient.inventory, itemId)
    return {
        id: quest.id,
        instanceId,
        revision: 1,
        issuerId: issuer.id,
        issuerName: issuer.nickname,
        ...questText(quest),
        objectives: [
            {
                kind: 'deliver',
                itemId,
                quantity: quest.goal,
                recipientId: issuer.id,
            },
        ],
        objectiveLabels: [
            `Принести ${ITEM_DEFINITIONS[itemId].name} × ${String(quest.goal)}: ${issuer.nickname}.`,
        ],
        rewardGold: quest.rewardGold,
        rewardItems: [],
        funding: 'city',
        rewardMode: quest.rewardMode ?? DEFAULT_QUEST_REWARD_MODE,
        itemRecipient: 'submitter',
        expiresAt: 0,
        progress: [complete ? quest.goal : Math.min(quantity, quest.goal)],
        status: quest.status,
        ...storyQuestNotice(quest, complete),
        ...(complete ? { receiptId: instanceId } : {}),
    }
}

/** Canonical actual issuers and phases, independent of the model's remembered prose. */
export function conversationContracts(
    environment: QuestConversationEnvironment,
    issuerId: string,
    recipientId: string,
    now: number
): NpcQuestSnapshot[] {
    if (!Number.isFinite(now)) {
        return []
    }
    const issuer = environment.getCharacter(issuerId)
    const recipient = environment.getCharacter(recipientId)
    const contracts = [
        ...environment.quests.conversation(issuerId, recipientId),
        ...environment.parties
            .questHistory(issuerId, recipientId)
            .map((job) => guildContract(job, issuer, issuerId)),
    ]
    if (issuer !== undefined && recipient !== undefined) {
        const story = storyContract(environment, issuer, recipient)
        if (story !== undefined) {
            contracts.push(story)
        }
    }
    return contracts
}

export function questConversationJobs(
    environment: QuestConversationEnvironment,
    issuer: GameCharacter,
    player: GameCharacter,
    now: number
) {
    return conversationContracts(environment, issuer.id, player.id, now).filter(
        (job) => ['active', 'ready', 'reward_missing'].includes(job.status)
    )
}
