import {
    DEFAULT_QUEST_REWARD_MODE,
    getWorldLocationDefinition,
    type GuildQuestDefinition,
    ITEM_DEFINITIONS,
    type QuestDraft,
    type QuestObjective,
    type QuestOfferSnapshot,
    workerQuestMessages,
} from '@my-game-ratata/contracts'

import { resolveAuthoredQuestDraft } from './authoredQuestOffers'
import type { GameCharacter } from './character'
import { guildQuests } from './guildRules'
import { snapshotItem } from './inventory'
import { npcQuestObjectiveMessage } from './npcQuestObjectiveText'
import type { NpcQuestEnvironment, QuestOfferRecord } from './npcQuestTypes'
import { questContact } from './npcQuestTypes'
import { validateQuestDraft } from './npcQuestValidation'
import {
    namedQuestPlace,
    questCompass,
    validateQuestExcursion,
} from './questExcursions'

export function createQuestOffer(
    issuer: GameCharacter,
    targetId: string,
    draft: QuestDraft,
    environment: NpcQuestEnvironment,
    id: string,
    now: number,
    boardOffer = false
): QuestOfferRecord | string {
    const authored = resolveAuthoredQuestDraft(
        issuer,
        targetId,
        draft,
        environment
    )
    return typeof authored === 'string'
        ? authored
        : createPreparedQuestOffer(
              issuer,
              targetId,
              authored,
              environment,
              id,
              now,
              boardOffer
          )
}

function createPreparedQuestOffer(
    issuer: GameCharacter,
    targetId: string,
    draft: QuestDraft,
    environment: NpcQuestEnvironment,
    id: string,
    now: number,
    boardOffer: boolean
): QuestOfferRecord | string {
    const target = contactedPlayer(issuer, targetId, environment, now)
    if (
        target === undefined ||
        (!boardOffer && environment.canIssue?.(issuer) === false)
    ) {
        return 'Не удаётся предложить задание этому собеседнику.'
    }
    const error =
        validateQuestDraft(issuer, draft, environment) ??
        validateQuestExcursion(target, draft, environment)
    if (error !== null) {
        return error
    }
    const rewards = draft.rewardItems.map((selected) => {
        const item = issuer.inventory.find(
            (entry) => entry.instanceId === selected.instanceId
        )
        return item === undefined
            ? undefined
            : { ...snapshotItem(item), quantity: selected.quantity }
    })
    if (rewards.some((item) => item === undefined)) {
        return 'Обещанной вещи у заказчика нет.'
    }
    return {
        ...(boardOffer ? { boardOffer: true } : {}),
        draft: structuredClone(draft),
        targetId,
        issuerDeath: issuer.deathSequence,
        view: {
            ...authoredQuestMetadata(draft),
            id,
            revision: 1,
            issuerId: issuer.id,
            issuerName: issuer.nickname,
            title: draft.title,
            description: draft.description,
            objectives: structuredClone(draft.objectives),
            objectiveLabels: draft.objectives.map((objective) =>
                objectiveLabel(objective, environment, issuer)
            ),
            objectiveMessages: draft.objectives.map((objective) =>
                npcQuestObjectiveMessage(objective, environment, issuer)
            ),
            rewardGold: draft.rewardGold,
            rewardItems: rewards.filter((item) => item !== undefined),
            funding: draft.funding,
            ...(draft.funding === 'city'
                ? { fundingCityId: issuer.locationId }
                : {}),
            rewardMode: DEFAULT_QUEST_REWARD_MODE,
            itemRecipient: 'submitter',
            expiresAt: now + 120_000,
        },
    }
}

export function createGuildBoardOffer(
    issuer: GameCharacter,
    targetId: string,
    definition: GuildQuestDefinition,
    environment: NpcQuestEnvironment,
    id: string,
    now: number
): QuestOfferRecord | string {
    const guildQuestId = guildQuests.find(
        (quest) => quest.id === definition.id
    )?.id
    const target = contactedPlayer(issuer, targetId, environment, now)
    if (target === undefined || guildQuestId === undefined) {
        return 'Заказ недоступен. Проверьте условия у распорядителя.'
    }
    const { title, titleMessage, description, descriptionMessage, rewardGold } =
        definition
    return {
        boardOffer: true,
        boardGuildId: definition.id,
        draft: null,
        targetId,
        issuerDeath: issuer.deathSequence,
        view: {
            id,
            guildQuestId,
            revision: 1,
            issuerId: issuer.id,
            issuerName: issuer.nickname,
            title,
            description,
            ...(titleMessage === undefined ? {} : { titleMessage }),
            ...(descriptionMessage === undefined ? {} : { descriptionMessage }),
            objectives: [],
            rewardGold,
            rewardItems: [],
            funding: 'city',
            rewardMode: DEFAULT_QUEST_REWARD_MODE,
            itemRecipient: 'submitter',
            expiresAt: now + 120_000,
        },
    }
}

function contactedPlayer(
    issuer: GameCharacter,
    id: string,
    environment: NpcQuestEnvironment,
    now: number
): GameCharacter | undefined {
    const target = environment.getCharacter(id)
    return target?.controllerKind === 'network_player' &&
        id !== issuer.id &&
        questContact(target, issuer, environment, now)
        ? target
        : undefined
}

export function createWorkerQuestOffer(
    issuer: GameCharacter,
    targetId: string,
    requestId: string,
    environment: NpcQuestEnvironment,
    id: string,
    now: number
): QuestOfferRecord | string {
    const request = environment.workers
        .list()
        .find((entry) => entry.id === requestId && entry.clerkId === issuer.id)
    const target = environment.getCharacter(targetId)
    if (target?.controllerKind !== 'network_player' || !target.connected) {
        return 'Предложи это обращение живому подключённому игроку: NPC пока не принимает договор через окно.'
    }
    if (
        request === undefined ||
        !questContact(target, issuer, environment, now)
    ) {
        return 'Это обращение работника сейчас недоступно.'
    }
    const objective: QuestObjective = {
        kind: 'deliver',
        itemId: request.requiredTrophyItemId,
        quantity: 1,
        recipientId: issuer.id,
    }
    return {
        draft: null,
        targetId,
        issuerDeath: issuer.deathSequence,
        view: {
            ...workerQuestMessages(request, 'npc'),
            id,
            revision: 1,
            issuerId: issuer.id,
            issuerName: issuer.nickname,
            title: `Вернуть к работе: ${request.workerName}`,
            description: `${request.workerName}: ${request.enemyName} мешает работе в ${request.locationName}. Принесите один трофей, сообщите о расчистке, дождитесь проверочного рабочего рейса и возвращения работника.`,
            objectives: [objective],
            objectiveLabels: [
                objectiveLabel(objective, environment, issuer),
                'Дождаться реальной проверки работы и возвращения работника',
            ],
            objectiveMessages: [
                null,
                { key: 'authored.npc.quest.workerAwaitReturn' },
            ],
            rewardGold: 30,
            rewardItems: [],
            funding: 'worker',
            fundingCityId: request.cityId,
            rewardMode: DEFAULT_QUEST_REWARD_MODE,
            itemRecipient: 'submitter',
            expiresAt: now + 120_000,
            workerRequestId: request.id,
        },
    }
}

export function objectiveLabel(
    objective: QuestObjective,
    environment: NpcQuestEnvironment,
    issuer: GameCharacter
): string {
    switch (objective.kind) {
        case 'deliver':
            return `Передать ${ITEM_DEFINITIONS[objective.itemId].name} × ${String(objective.quantity)}: ${recipientName(objective.recipientId, environment)}`
        case 'visit':
            return `Посетить: ${namedQuestPlace(objective.locationId, objective.position, environment)}${objective.position !== undefined && objective.locationId === issuer.locationId ? ` — ${questCompass(issuer.position, objective.position)} от заказчика` : ''}`
        case 'inspect': {
            const target = environment.getCharacter(objective.targetId)
            return `Расспросить по поручению: ${recipientName(objective.targetId, environment)}${target !== undefined ? ` — ${namedQuestPlace(target.locationId, target.position, environment)}${target.locationId === issuer.locationId ? `, ${questCompass(issuer.position, target.position)} от заказчика` : ''}` : ''}${objective.question !== undefined ? `. ${objective.question}` : ''}. Вернуться с отчётом к ${issuer.nickname}.`
        }
        case 'defeat':
            return `Победить ${objective.archetype === 'slime' ? 'враждебных слизней' : 'скелетов'} × ${String(objective.quantity)}: ${locationName(objective.locationId)}`
    }
}

function recipientName(id: string, environment: NpcQuestEnvironment): string {
    return id.startsWith('city:')
        ? 'городской склад'
        : (environment.getCharacter(id)?.nickname ?? id)
}

function locationName(id: string): string {
    return getWorldLocationDefinition(id)?.name ?? id
}

export function cloneQuestOffer(
    record: QuestOfferRecord | undefined
): QuestOfferSnapshot | null {
    return record === undefined ? null : structuredClone(record.view)
}

function authoredQuestMetadata(
    draft: QuestDraft
): Pick<
    QuestOfferSnapshot,
    'authoredQuestId' | 'titleMessage' | 'descriptionMessage'
> {
    return draft.authoredId === undefined
        ? {}
        : {
              authoredQuestId: draft.authoredId,
              titleMessage: { key: 'authored.story.title' },
              descriptionMessage: { key: 'authored.story.cityDescription' },
          }
}
