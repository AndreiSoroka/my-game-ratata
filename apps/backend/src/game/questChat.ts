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
import { QuestChatOrders } from './questChatOrders'
import { QuestChatReplies, type QuestQuestion } from './questChatReplies'
import {
    namedQuest,
    questClarification,
    questSpeech,
    unnamedHandIn,
    workerReportSubject,
} from './questChatWords'
import { questConversationJobs } from './questConversation'
import {
    createTurnInPrompt,
    type QuestTurnInEnvironment,
    readyTurnInAction,
    turnInContact,
} from './questTurnInRules'

interface Speaker {
    player: GameCharacter
    issuer: GameCharacter
    now: number
}

export interface QuestChatRequest extends Speaker {
    text: string
    jobs: NpcQuestSnapshot[]
    orders: BoardQuest[]
}

export class QuestChat {
    public readonly replies: QuestChatReplies
    private readonly boardDialogue: QuestChatOrders

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
        this.boardDialogue = new QuestChatOrders(
            environment,
            catalog,
            this.replies
        )
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
        const question = this.replies.question({ player, issuer, now })
        if (speech === undefined && question === undefined) {
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
        return this.handle(request, speech, question, board)
    }

    private handle(
        request: QuestChatRequest,
        speech: ReturnType<typeof questSpeech>,
        question: QuestQuestion | undefined,
        board: boolean
    ): boolean {
        switch (speech) {
            case undefined:
                return this.clarify(request, question)
            case 'yes':
                return this.confirmQuestion(request, question)
            case 'report':
                return this.report(request, question)
            case 'recommend':
            case 'take':
            case 'status':
            case 'details':
                return board && this.boardDialogue.heard(request, speech)
            case 'submit':
                return (
                    (board || request.jobs.length > 0) && this.submit(request)
                )
        }
    }

    private submit(request: QuestChatRequest): boolean {
        const jobs = request.jobs.filter((job) =>
            this.replies.matchesJob(request.player, job, request.text)
        )
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
            this.replies.askWhichToSubmit(request, request.jobs)
        } else {
            this.submitGeneric(request)
        }
        return true
    }

    private submitDirect(request: QuestChatRequest, order: BoardQuest): void {
        const { player, issuer, now } = request
        if (this.catalog.directReady(player, order)) {
            this.show(
                player,
                issuer,
                this.catalog.directPrompt(issuer, order, now),
                now
            )
        } else if (this.replies.approachIfBlocked(request)) {
            return
        } else if (
            order.objectives.length > 0 &&
            order.objectives.every((objective) => objective.kind === 'deliver')
        ) {
            this.replies.explainDelivery(
                request,
                this.catalog.groupCanTake(player, order)
            )
        } else {
            this.replies.say(
                request,
                'Сначала возьми этот заказ. Прогресс начнёт считаться после принятия.',
                'Take the order first. Progress starts once you accept it.'
            )
        }
    }

    private submitGeneric(request: QuestChatRequest): void {
        const { player, jobs, orders } = request
        const ready = jobs.filter(
            (candidate) =>
                readyTurnInAction(this.environment, player, candidate) !==
                undefined
        )
        if (ready.length === 1 && ready[0] !== undefined) {
            this.openOrExplain(request, ready[0])
        } else if (ready.length > 1) {
            this.replies.askWhichToSubmit(request, ready)
        } else {
            const deliveries = orders.filter((candidate) =>
                this.catalog.directReady(player, candidate)
            )
            const bell = deliveries.find(
                ({ entry }) => entry.source === 'story'
            )
            const hunt = jobs.find((job) => job.id === 'slime_hunt')
            if (bell !== undefined && hunt !== undefined) {
                this.boardDialogue.describeOrder(request, bell, hunt)
                return
            }
            if (jobs.length === 1 && jobs[0] !== undefined) {
                this.openOrExplain(request, jobs[0])
            } else if (jobs.length > 0) {
                this.replies.askWhichToSubmit(request, jobs)
            } else {
                this.replies.askWhich(request, [
                    ...deliveries.map(({ entry }) => entry),
                ])
            }
        }
    }

    private clarify(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        if (question === undefined) {
            return false
        }
        const matches = this.questionJobs(request, question).filter(
            (job) =>
                questClarification(request.text, job) &&
                this.replies.matchesJob(request.player, job, request.text)
        )
        const job = matches.length === 1 ? matches[0] : undefined
        if (job === undefined) {
            return false
        }
        this.openOrExplain(request, job)
        return true
    }

    private confirmQuestion(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        if (question?.kind !== 'confirm') {
            return false
        }
        const [job] = this.questionJobs(request, question)
        if (job === undefined) {
            return false
        }
        this.openOrExplain(request, job)
        return true
    }

    private report(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        const workers = request.jobs.filter(
            (job) => job.workerRequestId !== undefined
        )
        const subject = workerReportSubject(request.text)
        const matches = workers.filter((job) =>
            this.replies.matchesJob(
                request.player,
                job,
                subject ?? request.text
            )
        )
        if (subject !== undefined && matches.length === 0) {
            this.replies.askWhichToSubmit(request, workers)
            return true
        }
        const [bound] =
            question?.kind === 'confirm'
                ? this.questionJobs(request, question).filter(
                      (job) => job.workerRequestId !== undefined
                  )
                : []
        const job =
            matches[0] ??
            bound ??
            (workers.length === 1 ? workers[0] : undefined)
        if (job === undefined) {
            return false
        }
        this.openOrExplain(request, job)
        return true
    }

    private questionJobs(
        { jobs }: QuestChatRequest,
        question: QuestQuestion | undefined
    ): NpcQuestSnapshot[] {
        return jobs.filter(
            (job) =>
                question?.jobs.some(
                    ({ instanceId, revision }) =>
                        instanceId === job.instanceId &&
                        revision === job.revision
                ) === true
        )
    }

    private openOrExplain(request: Speaker, job: NpcQuestSnapshot): void {
        const { issuer, player, now } = request
        this.replies.clearQuestion(request)
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

    public update(now: number): void {
        this.replies.update(now)
    }

    public stop(): void {
        this.replies.stop()
    }
}
