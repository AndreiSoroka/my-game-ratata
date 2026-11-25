import type {
    GameLocale,
    NpcQuestSnapshot,
    QuestBoardEntry,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { BoardQuest } from './questBoardCatalog'
import type { QuestQuestion } from './questChatReplies'
import {
    isWorkerName,
    localizedQuestText,
    localizedQuestTitle,
    namedQuest,
    type QuestChatTitle,
    questClarification,
    refersToQuestInContext,
    refersToWorker,
    reportsDelivery,
} from './questChatWords'
import {
    activeWorkerRequest,
    type QuestTurnInEnvironment,
} from './questTurnInRules'
import { availableItemQuantity } from './rewardReservations'

export interface QuestChoice extends QuestChatTitle {
    source: 'job' | 'board'
    instanceId: string
    revision: number
    workerId?: string
}

export function boardQuestChoice({ entry, guild }: BoardQuest): QuestChoice {
    const workerId = guild?.workRequest?.workerId
    return {
        id: entry.id,
        title: entry.title,
        ...(entry.titleMessage === undefined
            ? {}
            : { titleMessage: entry.titleMessage }),
        source: 'board',
        instanceId: entry.id,
        revision: entry.revision,
        ...(workerId === undefined ? {} : { workerId }),
    }
}

export class QuestChatChoices {
    public constructor(private readonly environment: QuestTurnInEnvironment) {}

    public jobChoice(
        player: GameCharacter,
        job: NpcQuestSnapshot
    ): QuestChoice {
        const workerId = activeWorkerRequest(
            this.environment,
            player,
            job
        )?.workerId
        return {
            id: job.id,
            title: job.title,
            ...(job.titleMessage === undefined
                ? {}
                : { titleMessage: job.titleMessage }),
            source: 'job',
            instanceId: job.instanceId,
            revision: job.revision,
            ...(workerId === undefined ? {} : { workerId }),
        }
    }

    public matchesJob(
        player: GameCharacter,
        job: NpcQuestSnapshot,
        text: string
    ): boolean {
        return this.matchesChoice(this.jobChoice(player, job), text)
    }

    public matchesChoice(choice: QuestChoice, text: string): boolean {
        if (namedQuest(text, choice)) {
            return true
        }
        const worker = this.worker(choice)
        return worker !== undefined && refersToWorker(text, worker)
    }

    public matchesClarification(choice: QuestChoice, text: string): boolean {
        if (questClarification(text, choice)) {
            return this.matchesChoice(choice, text)
        }
        const worker = this.worker(choice)
        return worker !== undefined && isWorkerName(text, worker)
    }

    private worker(choice: QuestChoice): GameCharacter | undefined {
        return choice.workerId === undefined
            ? undefined
            : this.environment.getCharacter(choice.workerId)
    }
}

export function topicForSubmit(
    text: string,
    question: QuestQuestion | undefined,
    jobs: QuestChoice[]
): QuestChoice | undefined {
    const topic = question?.choices[0]
    if (topic === undefined || question === undefined) {
        return undefined
    }
    if (question.kind === 'confirm' && refersToQuestInContext(text)) {
        return topic
    }
    if (
        question.kind !== 'topic' ||
        !(refersToQuestInContext(text) || reportsDelivery(text))
    ) {
        return undefined
    }
    return (
        (topic.source === 'board'
            ? jobs.find(
                  ({ id, revision }) =>
                      id === topic.id && revision === topic.revision
              )
            : undefined) ?? topic
    )
}

export function boardDetails(
    entry: QuestBoardEntry,
    quantity: number,
    locale: GameLocale
): string {
    const title = localizedQuestTitle(entry, locale)
    const description = localizedQuestText(
        entry.description,
        entry.descriptionMessage,
        locale
    )
    const gold = String(entry.rewardGold)
    const items = String(quantity)
    const reward =
        locale === 'ru'
            ? `За выполнение — ${gold} золота${quantity > 0 ? ` и предметы × ${items}` : ''}.`
            : `Reward — ${gold} gold${quantity > 0 ? ` and ${items} item${quantity === 1 ? '' : 's'}` : ''}.`
    const length = 380 - title.length - reward.length
    const detail =
        description.length <= length
            ? description
            : `${description.slice(0, length - 1).trimEnd()}…`
    return `${title}\n${detail}\n${reward}`
}

export function boardOrderStatus(
    player: GameCharacter,
    { entry, objectives }: BoardQuest,
    locale: GameLocale
): string {
    const delivery = objectives[0]
    const title = localizedQuestTitle(entry, locale)
    if (entry.source !== 'story' || delivery?.kind !== 'deliver') {
        return locale === 'ru'
            ? `«${title}». ${entry.description}`
            : `“${title}”. ${entry.description}`
    }
    const available = Math.min(
        delivery.quantity,
        availableItemQuantity(player.inventory, delivery.itemId)
    )
    const progress = `(${String(available)}/${String(delivery.quantity)})`
    return locale === 'ru'
        ? `«${title}» ${progress}. Для сдачи нужны три сердца из рюкзака.`
        : `“${title}” ${progress}. Bring the three hearts from your bag.`
}
