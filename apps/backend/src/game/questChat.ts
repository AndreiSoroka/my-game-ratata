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
import {
    boardQuestChoice,
    type QuestChoice,
    topicForSubmit,
} from './questChatChoices'
import { QuestChatOrders } from './questChatOrders'
import { QuestChatReplies, type QuestQuestion } from './questChatReplies'
import { QuestChatTurnIns } from './questChatTurnIns'
import {
    asksToHandIn,
    questSpeech,
    workerReportSubject,
} from './questChatWords'
import { questConversationJobs } from './questConversation'
import { type QuestTurnInEnvironment, turnInContact } from './questTurnInRules'

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
    private readonly turnIns: QuestChatTurnIns

    public constructor(
        private readonly environment: QuestTurnInEnvironment,
        private readonly catalog: QuestBoardCatalog,
        show: (
            player: GameCharacter,
            issuer: GameCharacter,
            view: QuestTurnInPromptSnapshot,
            now: number
        ) => boolean
    ) {
        this.replies = new QuestChatReplies(environment)
        this.turnIns = new QuestChatTurnIns(
            environment,
            catalog,
            this.replies,
            show
        )
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
        const request = this.request(player, issuer, text, now)
        if (
            speech === 'submit' &&
            issuer.id !== questBoardIssuerId &&
            request.jobs.length === 0 &&
            question?.kind !== 'submit'
        ) {
            return false
        }
        return this.handle(request, speech, question)
    }

    public openFromDialogue(
        player: GameCharacter,
        issuer: GameCharacter,
        instanceId: string,
        now: number
    ): boolean {
        if (!turnInContact(this.environment, player, issuer, now)) {
            return false
        }
        const request = this.request(player, issuer, '', now)
        const job = request.jobs.find(
            (entry) => entry.instanceId === instanceId
        )
        if (job !== undefined) {
            return this.turnIns.openJob(request, job)
        }
        const order = request.orders.find(
            ({ entry }) => entry.id === instanceId
        )
        return order !== undefined && this.turnIns.openDirect(request, order)
    }

    private request(
        player: GameCharacter,
        issuer: GameCharacter,
        text: string,
        now: number
    ): QuestChatRequest {
        return {
            player,
            issuer,
            text,
            now,
            jobs: questConversationJobs(this.environment, issuer, player, now),
            orders:
                issuer.id === questBoardIssuerId
                    ? this.catalog.available(player, now)
                    : [],
        }
    }

    private handle(
        request: QuestChatRequest,
        speech: ReturnType<typeof questSpeech>,
        question: QuestQuestion | undefined
    ): boolean {
        const board = request.issuer.id === questBoardIssuerId
        switch (speech) {
            case undefined:
                return this.clarify(request, question)
            case 'yes':
                return this.confirmQuestion(request, question)
            case 'report':
                return this.report(request, question)
            case 'take':
                return board && this.boardDialogue.take(request, question)
            case 'recommend':
            case 'status':
            case 'details':
                return board && this.boardDialogue.heard(request, speech)
            case 'submit':
                return this.submit(request, question)
        }
    }

    private submit(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        const { player, orders, text, now } = request
        const jobs = this.jobChoices(request)
        const named = [...jobs, ...orders.map(boardQuestChoice)].filter(
            (choice) => this.replies.choices.matchesChoice(choice, text)
        )
        if (named.length > 0) {
            return this.turnIns.selectForSubmit(request, named)
        }
        const topic = topicForSubmit(text, question, jobs)
        if (topic !== undefined) {
            return this.turnIns.selectForSubmit(request, [topic])
        }
        const direct =
            jobs.length === 0 || asksToHandIn(text)
                ? orders
                      .filter((order) =>
                          this.catalog.directPreviewable(player, order, now)
                      )
                      .map(boardQuestChoice)
                : []
        return this.turnIns.selectForSubmit(request, [...jobs, ...direct])
    }

    private clarify(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        if (question === undefined || question.kind === 'topic') {
            return false
        }
        const matches = question.choices.filter((choice) =>
            this.replies.choices.matchesClarification(choice, request.text)
        )
        const choice = matches.length === 1 ? matches[0] : undefined
        if (choice === undefined) {
            return false
        }
        if (question.kind === 'take') {
            this.boardDialogue.takeChoice(request, choice)
        } else {
            this.turnIns.submitChoice(request, choice)
        }
        return true
    }

    private confirmQuestion(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        const choice = question?.choices[0]
        if (choice === undefined || question === undefined) {
            return false
        }
        if (
            question.kind === 'topic' &&
            choice.source === 'board' &&
            request.issuer.id === questBoardIssuerId
        ) {
            this.boardDialogue.takeChoice(request, choice)
            return true
        }
        if (question.kind === 'confirm') {
            this.turnIns.submitChoice(request, choice)
            return true
        }
        return false
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
            this.replies.choices.matchesJob(
                request.player,
                job,
                subject ?? request.text
            )
        )
        if (subject !== undefined && matches.length === 0) {
            this.replies.askWhichQuest(
                request,
                this.jobChoices(request, workers),
                'submit'
            )
            return true
        }
        if (matches.length > 1) {
            this.replies.askWhichQuest(
                request,
                this.jobChoices(request, matches),
                'submit'
            )
            return true
        }
        const choice =
            question?.kind === 'confirm' ? question.choices[0] : undefined
        const bound = workers.find(
            (job) =>
                job.instanceId === choice?.instanceId &&
                job.revision === choice.revision
        )
        const job =
            matches[0] ??
            bound ??
            (workers.length === 1 ? workers[0] : undefined)
        if (job === undefined) {
            if (workers.length > 1) {
                this.replies.askWhichQuest(
                    request,
                    this.jobChoices(request, workers),
                    'submit'
                )
                return true
            }
            return false
        }
        this.turnIns.openOrExplain(request, job)
        return true
    }

    private jobChoices(
        { player, jobs }: QuestChatRequest,
        choices = jobs
    ): QuestChoice[] {
        return choices.map((job) => this.replies.choices.jobChoice(player, job))
    }

    public update(now: number): void {
        this.replies.update(now)
    }

    public stop(): void {
        this.replies.stop()
    }
}
