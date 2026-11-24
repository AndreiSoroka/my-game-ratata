import type { NpcQuestSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { BoardQuest } from './questBoardCatalog'
import {
    localizedQuestTitle,
    namedQuest,
    type QuestChatTitle,
    questCompletionQuestion,
} from './questChatWords'
import { questConversationJobs } from './questConversation'
import {
    currentQuestContact,
    type QuestContact,
    questContactAt,
    type QuestTurnInEnvironment,
    turnInContact,
} from './questTurnInRules'
import { availableItemQuantity } from './rewardReservations'

export interface QuestQuestion extends QuestContact {
    instanceId: string
    revision: number
}

interface ReplyContact {
    issuer: GameCharacter
    player: GameCharacter
    now: number
}

export class QuestChatReplies {
    private readonly questions = new Map<string, QuestQuestion>()

    public consumeQuestion(playerId: string): QuestQuestion | undefined {
        const question = this.questions.get(playerId)
        this.questions.delete(playerId)
        return question
    }

    public questionIssuer(
        player: GameCharacter,
        now: number
    ): string | undefined {
        const question = this.questions.get(player.id)
        return question === undefined
            ? undefined
            : currentQuestContact(this.environment, player, question, now)?.id
    }

    public deliveredQuestion(
        issuer: GameCharacter,
        player: GameCharacter,
        text: string,
        now: number
    ): void {
        if (
            !questCompletionQuestion(text) ||
            !turnInContact(this.environment, player, issuer, now)
        ) {
            return
        }
        const jobs = questConversationJobs(
            this.environment,
            issuer,
            player,
            now
        ).filter((job) => namedQuest(text, job))
        if (jobs.length === 1 && jobs[0] !== undefined) {
            this.rememberQuestion(issuer, player, jobs[0], now)
        }
    }

    public rememberQuestion(
        issuer: GameCharacter,
        player: GameCharacter,
        job: NpcQuestSnapshot,
        now: number
    ): void {
        this.questions.set(player.id, {
            ...questContactAt(issuer, player, now + 30_000),
            instanceId: job.instanceId,
            revision: job.revision,
        })
    }

    public update(now: number): void {
        for (const [playerId, question] of this.questions) {
            const player = this.environment.getCharacter(playerId)
            if (
                player === undefined ||
                currentQuestContact(this.environment, player, question, now) ===
                    undefined
            ) {
                this.questions.delete(playerId)
            }
        }
    }

    public stop(): void {
        this.questions.clear()
    }

    public constructor(private readonly environment: QuestTurnInEnvironment) {}

    public askWhich(contact: ReplyContact, jobs: QuestChatTitle[]): void {
        if (jobs.length === 0) {
            this.say(
                contact,
                'Сейчас у тебя нет заказа для сдачи. Посмотри, какие заказы есть на доске у гильдии.',
                'You have no order to turn in right now. Check the board by the guild.'
            )
            return
        }
        const titles = (locale: 'ru' | 'en') =>
            [...new Set(jobs.map((job) => localizedQuestTitle(job, locale)))]
                .slice(0, 6)
                .join(', ')
        this.say(
            contact,
            `Какой заказ? Назови его. ${titles('ru')}`,
            `Which order? Tell me its name. ${titles('en')}`
        )
    }

    public askAbout(contact: ReplyContact, job: NpcQuestSnapshot): boolean {
        return this.say(
            contact,
            `Ты закончил «${localizedQuestTitle(job, 'ru')}»?`,
            `Did you finish “${localizedQuestTitle(job, 'en')}”?`
        )
    }

    public explain(contact: ReplyContact, job: NpcQuestSnapshot): void {
        this.say(
            contact,
            `«${localizedQuestTitle(job, 'ru')}» пока не готово к сдаче. ${job.notice ?? job.objectiveLabels?.join(' ') ?? ''}`,
            `“${localizedQuestTitle(job, 'en')}” is not ready to hand in yet.`
        )
    }

    public explainDelivery(contact: ReplyContact, groupCanTake: boolean): void {
        if (groupCanTake) {
            this.say(
                contact,
                'Для сдачи нужны свободные предметы из твоего рюкзака. Условия есть на доске.',
                'To hand this in, bring the required unreserved items from your bag. The terms are on the board.'
            )
        } else {
            this.say(
                contact,
                'Заказ может сдать лидер группы, когда место для договора свободно.',
                'The party leader can turn this in when there is no active group contract.'
            )
        }
    }

    public describeOrder(
        contact: ReplyContact,
        { entry, objectives }: BoardQuest,
        active?: NpcQuestSnapshot
    ): void {
        const delivery = objectives[0]
        const progress =
            entry.source === 'story' && delivery?.kind === 'deliver'
                ? ` (${String(Math.min(delivery.quantity, availableItemQuantity(contact.player.inventory, delivery.itemId)))}/${String(delivery.quantity)})`
                : ''
        const other =
            active === undefined
                ? ''
                : ` «${localizedQuestTitle(active, 'ru')}» — ${active.objectiveLabels?.[0] ?? ''}.`
        const otherEn =
            active === undefined
                ? ''
                : ` “${localizedQuestTitle(active, 'en')}” is a separate contract.`
        this.say(
            contact,
            `«${localizedQuestTitle(entry, 'ru')}»${progress}. ${entry.source === 'story' ? 'Для сдачи нужны три сердца из рюкзака.' : entry.description}${other}`,
            `“${localizedQuestTitle(entry, 'en')}”${progress}. ${entry.source === 'story' ? 'Bring the three hearts from your bag.' : entry.description}${otherEn}`
        )
    }

    public say(
        { issuer, player, now }: ReplyContact,
        ru: string,
        en: string
    ): boolean {
        const locale = this.environment.localeFor(player.id)
        return this.environment.whispers.send(
            issuer,
            player,
            locale === 'en' ? en : ru,
            now,
            { language: locale }
        )
    }
}
