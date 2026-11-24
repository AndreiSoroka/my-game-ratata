import type {
    NpcQuestSnapshot,
    QuestTurnInPromptSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type BoardQuest,
    type QuestBoardCatalog,
    questBoardIssuerId,
} from './questBoardCatalog'
import { QuestChatReplies, type QuestQuestion } from './questChatReplies'
import {
    namedQuest,
    questSpeech,
    unnamedHandIn,
    unnamedStatus,
} from './questChatWords'
import { questConversationJobs } from './questConversation'
import {
    createTurnInPrompt,
    currentQuestContact,
    type QuestTurnInEnvironment,
    readyTurnInAction,
    turnInContact,
} from './questTurnInRules'

interface Speaker {
    player: GameCharacter
    issuer: GameCharacter
    now: number
}

interface Request extends Speaker {
    text: string
    jobs: NpcQuestSnapshot[]
    orders: BoardQuest[]
}

export class QuestChat {
    public readonly replies: QuestChatReplies

    public constructor(
        private readonly environment: QuestTurnInEnvironment,
        private readonly catalog: QuestBoardCatalog,
        private readonly show: (
            player: GameCharacter,
            issuer: GameCharacter,
            view: QuestTurnInPromptSnapshot,
            now: number
        ) => void
    ) {
        this.replies = new QuestChatReplies(environment)
    }

    public heard(
        player: GameCharacter,
        issuer: GameCharacter,
        text: string,
        now: number
    ): boolean {
        if (!turnInContact(this.environment, player, issuer, now)) {
            return false
        }
        const speech = questSpeech(text)
        const question = this.replies.consumeQuestion(player.id)
        if (speech === undefined) {
            return false
        }

        const board = issuer.id === questBoardIssuerId
        const request = {
            player,
            issuer,
            text,
            now,
            jobs: questConversationJobs(this.environment, issuer, player, now),
            orders: board ? this.catalog.available(player, now) : [],
        }
        switch (speech) {
            case 'yes':
                return this.answer(request, question)
            case 'take':
                return board && this.take(request)
            case 'status':
                return board && this.status(request)
            case 'submit':
                return (
                    (board || request.jobs.length > 0) && this.submit(request)
                )
        }
    }

    private take(request: Request): boolean {
        const { player, issuer, orders, text, now } = request
        const matches = orders.filter(({ entry }) => namedQuest(text, entry))
        const match = matches.length === 1 ? matches[0] : undefined
        if (match !== undefined) {
            const offer = this.catalog.offer(issuer, player, match, now)
            if (!offer.accepted) {
                this.say(
                    issuer,
                    player,
                    offer.error ?? 'Заказ недоступен.',
                    'The order is unavailable.',
                    now
                )
            }
            return true
        }
        if (
            matches.length > 1 ||
            /(?:заказ|квест|поручен|договор|quest|order|«[^»]+»|["„“][^"”]+["“”])/iu.test(
                text
            )
        ) {
            this.replies.askWhich(
                request,
                (matches.length > 1 ? matches : orders).map(
                    ({ entry }) => entry
                )
            )
            return true
        }
        return false
    }

    private status(request: Request): boolean {
        const { issuer, player, jobs, orders, text, now } = request
        const named = jobs.filter((job) => namedQuest(text, job))
        const specified = orders.filter(({ entry }) => namedQuest(text, entry))
        if (named.length + specified.length > 1) {
            this.replies.askWhich(request, [
                ...named,
                ...specified.map(({ entry }) => entry),
            ])
            return true
        }
        if (specified[0] !== undefined) {
            this.replies.describeOrder(request, specified[0])
            return true
        }
        const job =
            named[0] ??
            (jobs.length === 1 && unnamedStatus(text) ? jobs[0] : undefined)
        if (job !== undefined && this.replies.askAbout(request, job)) {
            this.replies.rememberQuestion(issuer, player, job, now)
        } else if (job === undefined) {
            this.replies.askWhich(request, [
                ...jobs,
                ...orders.map(({ entry }) => entry),
            ])
        }
        return true
    }

    private submit(request: Request): boolean {
        const jobs = request.jobs.filter((job) => namedQuest(request.text, job))
        const orders = request.orders.filter(({ entry }) =>
            namedQuest(request.text, entry)
        )
        if (jobs.length + orders.length > 1) {
            this.replies.askWhich(request, [
                ...jobs,
                ...orders.map(({ entry }) => entry),
            ])
        } else if (jobs[0] !== undefined) {
            this.openOrExplain(request, jobs[0])
        } else if (orders[0] !== undefined) {
            this.submitDirect(request, orders[0])
        } else if (!unnamedHandIn(request.text)) {
            this.replies.askWhich(request, [
                ...request.jobs,
                ...request.orders.map(({ entry }) => entry),
            ])
        } else {
            this.submitGeneric(request)
        }
        return true
    }

    private submitDirect(request: Request, order: BoardQuest): void {
        const { player, issuer, now } = request
        if (this.catalog.directReady(player, order)) {
            this.show(
                player,
                issuer,
                this.catalog.directPrompt(issuer, order, now),
                now
            )
        } else if (
            order.objectives.length > 0 &&
            order.objectives.every((objective) => objective.kind === 'deliver')
        ) {
            this.replies.explainDelivery(
                request,
                this.catalog.groupCanTake(player, order)
            )
        } else {
            this.say(
                issuer,
                player,
                'Сначала возьми этот заказ. Прогресс начнёт считаться после принятия.',
                'Take the order first. Progress starts once you accept it.',
                now
            )
        }
    }

    private submitGeneric(request: Request): void {
        const { player, jobs, orders } = request
        const ready = jobs.filter(
            (candidate) =>
                readyTurnInAction(this.environment, player, candidate) !==
                undefined
        )
        if (ready.length === 1 && ready[0] !== undefined) {
            this.openOrExplain(request, ready[0])
        } else if (ready.length > 1) {
            this.replies.askWhich(request, ready)
        } else {
            const deliveries = orders.filter((candidate) =>
                this.catalog.directReady(player, candidate)
            )
            const bell = orders.find(({ entry }) => entry.source === 'story')
            const hunt = jobs.find((job) => job.id === 'slime_hunt')
            if (bell !== undefined && hunt !== undefined) {
                this.replies.describeOrder(request, bell, hunt)
                return
            }
            if (
                deliveries.length === 0 &&
                jobs.length === 1 &&
                jobs[0] !== undefined
            ) {
                this.openOrExplain(request, jobs[0])
            } else {
                this.replies.askWhich(request, [
                    ...jobs,
                    ...deliveries.map(({ entry }) => entry),
                ])
            }
        }
    }

    private answer(
        request: Request,
        question: QuestQuestion | undefined
    ): boolean {
        const { player, issuer, jobs, now } = request
        if (
            question?.issuerId !== issuer.id ||
            currentQuestContact(this.environment, player, question, now) ===
                undefined
        ) {
            return false
        }
        const job = jobs.find(
            (item) =>
                item.instanceId === question.instanceId &&
                item.revision === question.revision
        )
        if (job !== undefined) {
            this.openOrExplain(request, job)
        }
        return true
    }

    private openOrExplain(request: Speaker, job: NpcQuestSnapshot): void {
        const { issuer, player, now } = request
        const action = readyTurnInAction(this.environment, player, job)
        if (action !== undefined) {
            this.show(
                player,
                issuer,
                createTurnInPrompt(
                    this.environment,
                    issuer,
                    player.id,
                    job,
                    action,
                    now
                ),
                now
            )
        } else {
            this.replies.explain(request, job)
        }
    }

    public say(
        issuer: GameCharacter,
        player: GameCharacter,
        ru: string,
        en: string,
        now: number
    ): boolean {
        return this.replies.say({ issuer, player, now }, ru, en)
    }

    public update(now: number): void {
        this.replies.update(now)
    }

    public stop(): void {
        this.replies.stop()
    }
}
