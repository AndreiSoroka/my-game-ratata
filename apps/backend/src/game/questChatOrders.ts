import type { BoardQuest, QuestBoardCatalog } from './questBoardCatalog'
import type { QuestChatRequest } from './questChat'
import {
    boardDetails,
    boardOrderStatus,
    boardQuestChoice,
    type QuestChoice,
} from './questChatChoices'
import {
    type QuestChatReplies,
    type QuestQuestion,
    type ReplyContact,
} from './questChatReplies'
import {
    activeQuestList,
    localizedQuestTitle,
    refersToQuestInContext,
    unnamedStatus,
} from './questChatWords'
import {
    offerOverlap,
    overlapHint,
    type QuestOverlap,
} from './questOfferOverlap'
import type { QuestTurnInEnvironment } from './questTurnInRules'

export class QuestChatOrders {
    public constructor(
        private readonly environment: QuestTurnInEnvironment,
        private readonly catalog: QuestBoardCatalog,
        private readonly replies: QuestChatReplies
    ) {}

    public heard(
        request: QuestChatRequest,
        speech: 'details' | 'recommend' | 'status'
    ): boolean {
        switch (speech) {
            case 'details':
                return this.describeBoard(request)
            case 'recommend':
                return this.recommend(request)
            case 'status':
                return this.status(request)
        }
    }

    private describeBoard(request: QuestChatRequest): boolean {
        const orders = this.catalog.offerable(request.player, request.now)
        const replyLimit = 6
        for (const { entry } of orders.slice(0, replyLimit)) {
            const items = this.environment.quests.publications.get(
                entry.id,
                request.now
            )?.draft.rewardItems
            const quantity =
                items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
            this.replies.say(
                request,
                boardDetails(entry, quantity, 'ru'),
                boardDetails(entry, quantity, 'en')
            )
        }
        if (orders.length === 0) {
            this.replies.say(
                request,
                'Сейчас у меня нет свободных поручений для тебя.',
                'I have no available quests for you right now.'
            )
        } else if (orders.length > replyLimit) {
            this.replies.say(
                request,
                'Остальные условия можешь посмотреть на доске.',
                'You can check the other orders on the board.'
            )
        }
        return true
    }

    private recommend(request: QuestChatRequest): boolean {
        const { player, issuer, now } = request
        const current =
            this.environment.quests.snapshot(player.id, now).questOffer ?? null
        if (current !== null) {
            if (current.issuerId === issuer.id) {
                this.introduce(request, current)
            } else {
                this.replies.otherIssuerOffer(request)
            }
            return true
        }
        const orders = this.catalog.offerable(player, now)
        const order =
            orders.find(
                (entry) => this.overlap(request, entry) !== undefined
            ) ??
            orders.find(({ entry }) => entry.id === 'slime_hunt') ??
            orders[0]
        if (
            order !== undefined &&
            this.catalog.offer(issuer, player, order, now).accepted
        ) {
            this.replies.rememberTopic(request, boardQuestChoice(order))
            this.introduce(request, order.entry, this.overlap(request, order))
            return true
        }
        this.noOffer(request)
        return true
    }

    private noOffer(request: ReplyContact): void {
        const { player } = request
        const group = this.environment.parties.contractGroup(player.id)
        if (group.leaderId !== player.id) {
            this.replies.say(
                request,
                'Договоры гильдии может взять лидер твоей группы.',
                'Your party leader can take guild contracts.'
            )
        } else {
            this.replies.say(
                request,
                'Сейчас у меня нет свободного поручения для тебя.',
                'I have no available quest for you right now.'
            )
        }
    }

    private introduce(
        request: ReplyContact,
        quest: Parameters<typeof localizedQuestTitle>[0],
        overlap?: QuestOverlap
    ): void {
        this.replies.say(
            request,
            `Могу предложить «${localizedQuestTitle(quest, 'ru')}». Вот условия.${overlapHint(overlap, 'ru')}`,
            `I can offer “${localizedQuestTitle(quest, 'en')}”. Here are the terms.${overlapHint(overlap, 'en')}`
        )
    }

    public take(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        const { orders, text } = request
        const choices = orders.map(boardQuestChoice)
        const named = choices.filter((choice) =>
            this.replies.choices.matchesChoice(choice, text)
        )
        if (named.length > 0) {
            return this.select(request, named)
        }
        if (question?.kind === 'take') {
            const remembered = question.choices.filter((choice) =>
                this.replies.choices.matchesChoice(choice, text)
            )
            return remembered.length === 0 || this.select(request, remembered)
        }
        return this.takeFromContext(request, question)
    }

    private takeFromContext(
        request: QuestChatRequest,
        question: QuestQuestion | undefined
    ): boolean {
        const { player, issuer, text, now } = request
        if (refersToQuestInContext(text)) {
            const topic =
                question?.kind === 'topic' ? question.choices[0] : undefined
            if (topic?.source === 'board') {
                this.takeChoice(request, topic)
                return true
            }
            const offer = this.environment.quests.snapshot(
                player.id,
                now
            ).questOffer
            if (offer?.issuerId === issuer.id) {
                this.introduce(request, offer)
                return true
            }
        }
        if (
            !/(?:заказ|квест|поручен|задан|договор|quest|order|task)/iu.test(
                text
            )
        ) {
            return false
        }
        return this.select(
            request,
            this.catalog.offerable(player, now).map(boardQuestChoice)
        )
    }

    private select(request: QuestChatRequest, choices: QuestChoice[]): boolean {
        if (choices.length === 1 && choices[0] !== undefined) {
            this.takeChoice(request, choices[0])
        } else if (choices.length > 0) {
            this.replies.askWhichQuest(request, choices, 'take')
        } else {
            this.noOffer(request)
        }
        return true
    }

    public takeChoice(request: QuestChatRequest, choice: QuestChoice): void {
        const { player, issuer, orders, now } = request
        const order = orders.find(
            ({ entry }) =>
                entry.id === choice.instanceId &&
                entry.revision === choice.revision
        )
        this.replies.clearQuestion(request)
        if (order === undefined) {
            this.replies.say(
                request,
                'Это поручение изменилось или уже недоступно.',
                'This quest has changed or is no longer available.'
            )
            return
        }
        const current = this.environment.quests.snapshot(
            player.id,
            now
        ).questOffer
        if (
            current !== null &&
            current !== undefined &&
            current.issuerId !== issuer.id
        ) {
            this.replies.otherIssuerOffer(request)
            return
        }
        if (!this.catalog.groupCanTake(player, order)) {
            this.noOffer(request)
            return
        }
        const offer = this.catalog.offer(issuer, player, order, now)
        if (offer.accepted) {
            this.replies.rememberTopic(request, choice)
            const overlap = this.overlap(request, order)
            if (overlap !== undefined) {
                this.introduce(request, order.entry, overlap)
            }
        } else {
            this.replies.say(
                request,
                offer.error ?? 'Заказ недоступен.',
                'The order is unavailable.'
            )
        }
    }

    private overlap(
        { player, now, jobs }: QuestChatRequest,
        order: BoardQuest
    ) {
        return offerOverlap(order, [
            ...jobs,
            ...(this.environment.quests.snapshot(player.id, now).quests ?? []),
        ])
    }

    private status(request: QuestChatRequest): boolean {
        const { issuer, player, jobs, orders, text, now } = request
        const named = jobs.filter((job) =>
            this.replies.choices.matchesJob(player, job, text)
        )
        const specified = orders.filter((order) =>
            this.replies.choices.matchesChoice(boardQuestChoice(order), text)
        )
        if (named.length + specified.length > 1) {
            this.replies.askWhich(request, [
                ...named,
                ...specified.map(({ entry }) => entry),
            ])
            return true
        }
        if (specified[0] !== undefined) {
            this.replies.rememberTopic(request, boardQuestChoice(specified[0]))
            this.replies.say(
                request,
                boardOrderStatus(request.player, specified[0], 'ru'),
                boardOrderStatus(request.player, specified[0], 'en')
            )
            return true
        }
        const job =
            named[0] ??
            (jobs.length === 1 && unnamedStatus(text) ? jobs[0] : undefined)
        if (job !== undefined && this.replies.askAbout(request, job)) {
            this.replies.rememberQuestion(issuer, player, job, now)
        } else if (job === undefined) {
            this.replies.describeContracts(
                request,
                jobs,
                unnamedStatus(text) || activeQuestList(text)
                    ? []
                    : this.catalog
                          .offerable(player, now)
                          .map(({ entry }) => entry)
            )
        }
        return true
    }
}
