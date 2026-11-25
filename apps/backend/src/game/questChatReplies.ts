import {
    type NpcQuestSnapshot,
    type WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { questTransferReachable } from './npcQuestTypes'
import { QuestChatChoices, type QuestChoice } from './questChatChoices'
import {
    localizedQuestText,
    localizedQuestTitle,
    type QuestChatTitle,
    questCompletionQuestion,
} from './questChatWords'
import { questConversationJobs } from './questConversation'
import {
    activeWorkerRequest,
    currentQuestContact,
    type QuestContact,
    questContactAt,
    type QuestTurnInEnvironment,
    turnInContact,
} from './questTurnInRules'
import { workerReportText } from './questWorkerDialogue'

export interface QuestQuestion extends QuestContact {
    playerId: string
    kind: 'take' | 'submit' | 'confirm' | 'topic'
    choices: QuestChoice[]
}

export interface ReplyContact {
    issuer: GameCharacter
    player: GameCharacter
    now: number
}

export class QuestChatReplies {
    private readonly questions = new Map<string, QuestQuestion>()

    public otherIssuerOffer(request: ReplyContact): void {
        this.say(
            request,
            'У тебя уже открыты условия другого заказчика. Реши, берёшь ли то поручение.',
            'You already have an offer from another quest giver. Decide whether to take that one first.'
        )
    }

    public question({
        player,
        issuer,
        now,
    }: ReplyContact): QuestQuestion | undefined {
        const key = questionKey(player.id, issuer.id)
        const question = this.questions.get(key)
        if (question === undefined) {
            return undefined
        }
        if (
            currentQuestContact(this.environment, player, question, now) ===
            issuer
        ) {
            return question
        }
        this.questions.delete(key)
        return undefined
    }

    public clearQuestion({ player, issuer }: ReplyContact): void {
        this.questions.delete(questionKey(player.id, issuer.id))
    }

    public questionIssuer(
        player: GameCharacter,
        now: number
    ): string | undefined {
        const issuers = [...this.questions.values()]
            .filter((question) => question.playerId === player.id)
            .flatMap(
                (question) =>
                    currentQuestContact(this.environment, player, question, now)
                        ?.id ?? []
            )
        return issuers.length === 1 ? issuers[0] : undefined
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
        ).filter((job) => this.choices.matchesJob(player, job, text))
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
        this.remember(
            { issuer, player, now },
            [this.choices.jobChoice(player, job)],
            'confirm'
        )
    }

    public rememberTopic(contact: ReplyContact, choice: QuestChoice): void {
        this.remember(contact, [choice], 'topic')
    }

    private remember(
        { issuer, player, now }: ReplyContact,
        choices: QuestChoice[],
        kind: QuestQuestion['kind']
    ): void {
        this.questions.set(questionKey(player.id, issuer.id), {
            ...questContactAt(issuer, player, now + 30_000),
            playerId: player.id,
            kind,
            choices,
        })
    }

    public update(now: number): void {
        for (const [key, question] of this.questions) {
            const player = this.environment.getCharacter(question.playerId)
            if (
                player === undefined ||
                currentQuestContact(this.environment, player, question, now) ===
                    undefined
            ) {
                this.questions.delete(key)
            }
        }
    }

    public stop(): void {
        this.questions.clear()
    }

    public readonly choices: QuestChatChoices

    public constructor(private readonly environment: QuestTurnInEnvironment) {
        this.choices = new QuestChatChoices(environment)
    }

    public askWhich(contact: ReplyContact, jobs: QuestChatTitle[]): boolean {
        if (jobs.length === 0) {
            return this.say(
                contact,
                'Сейчас у тебя нет заказа для сдачи. Посмотри, какие заказы есть на доске у гильдии.',
                'You have no order to turn in right now. Check the board by the guild.'
            )
        }
        const titles = (locale: 'ru' | 'en') =>
            [...new Set(jobs.map((job) => localizedQuestTitle(job, locale)))]
                .slice(0, 6)
                .join(', ')
        return this.say(
            contact,
            `Какой заказ? Назови его. ${titles('ru')}`,
            `Which order? Tell me its name. ${titles('en')}`
        )
    }

    public askWhichQuest(
        contact: ReplyContact,
        choices: QuestChoice[],
        kind: 'take' | 'submit'
    ): void {
        if (this.askWhich(contact, choices) && choices.length > 0) {
            this.remember(contact, choices, kind)
        }
    }

    public describeContracts(
        contact: ReplyContact,
        jobs: NpcQuestSnapshot[],
        offers: QuestChatTitle[]
    ): void {
        const titles = (entries: QuestChatTitle[], locale: 'ru' | 'en') =>
            entries
                .map((entry) => localizedQuestTitle(entry, locale))
                .join(', ')
        const activeRu =
            jobs.length > 0
                ? `У тебя в работе ${titles(jobs, 'ru')}.`
                : 'У тебя нет активных поручений от меня.'
        const activeEn =
            jobs.length > 0
                ? `Your active quests are ${titles(jobs, 'en')}.`
                : 'You have no active quests from me.'
        this.say(
            contact,
            offers.length > 0
                ? `${activeRu} Сейчас могу предложить ${titles(offers, 'ru')}.`
                : activeRu,
            offers.length > 0
                ? `${activeEn} I can currently offer ${titles(offers, 'en')}.`
                : activeEn
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
        const request = activeWorkerRequest(
            this.environment,
            contact.player,
            job
        )
        if (request !== undefined) {
            this.explainWorker(contact, job, request)
            return
        }
        if (job.status === 'ready' && this.approachIfBlocked(contact)) {
            return
        }
        const detailEn = localizedQuestText(
            '',
            job.noticeMessage ?? job.objectiveMessages?.[0],
            'en'
        )
        this.say(
            contact,
            `«${localizedQuestTitle(job, 'ru')}» пока не готово к сдаче. ${job.notice ?? job.objectiveLabels?.join(' ') ?? ''}`,
            `“${localizedQuestTitle(job, 'en')}” is not ready to hand in yet.${detailEn === '' ? '' : ` ${detailEn}`}`
        )
    }

    public approachIfBlocked(contact: ReplyContact): boolean {
        if (
            questTransferReachable(
                contact.player,
                contact.issuer,
                this.environment
            )
        ) {
            return false
        }
        this.say(
            contact,
            'Подойди ко мне ближе, чтобы оформить сдачу.',
            'Come closer to hand in the quest.'
        )
        return true
    }

    private explainWorker(
        contact: ReplyContact,
        job: NpcQuestSnapshot,
        request: WorkRequestSnapshot
    ): void {
        const [ru, en] = workerReportText(contact, request, this.environment)
        if (this.say(contact, ru, en)) {
            this.rememberQuestion(
                contact.issuer,
                contact.player,
                job,
                contact.now
            )
        }
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

function questionKey(playerId: string, issuerId: string): string {
    return JSON.stringify([playerId, issuerId])
}
