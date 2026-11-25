import type {
    NpcQuestSnapshot,
    QuestTurnInPromptSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { BoardQuest, QuestBoardCatalog } from './questBoardCatalog'
import type { QuestChatRequest } from './questChat'
import { boardQuestChoice, type QuestChoice } from './questChatChoices'
import type { QuestChatReplies, ReplyContact } from './questChatReplies'
import {
    createTurnInPrompt,
    type QuestTurnInEnvironment,
    turnInPreviewAction,
} from './questTurnInRules'

export class QuestChatTurnIns {
    public constructor(
        private readonly environment: QuestTurnInEnvironment,
        private readonly catalog: QuestBoardCatalog,
        private readonly replies: QuestChatReplies,
        private readonly show: (
            player: GameCharacter,
            issuer: GameCharacter,
            view: QuestTurnInPromptSnapshot,
            now: number
        ) => boolean
    ) {}

    public openDirect(request: ReplyContact, order: BoardQuest): boolean {
        const { player, issuer, now } = request
        if (!this.catalog.directPreviewable(player, order, now)) {
            return false
        }
        this.replies.rememberTopic(request, boardQuestChoice(order))
        return this.show(
            player,
            issuer,
            this.catalog.directPrompt(issuer, order, now),
            now
        )
    }

    private submitDirect(request: QuestChatRequest, order: BoardQuest): void {
        if (
            this.openDirect(request, order) ||
            this.replies.approachIfBlocked(request)
        ) {
            return
        }
        if (
            order.objectives.length > 0 &&
            order.objectives.every(({ kind }) => kind === 'deliver')
        ) {
            this.replies.explainDelivery(
                request,
                this.catalog.groupCanTake(request.player, order)
            )
        } else {
            this.replies.say(
                request,
                'Сначала возьми этот заказ. Прогресс начнёт считаться после принятия.',
                'Take the order first. Progress starts once you accept it.'
            )
        }
    }

    public selectForSubmit(
        request: QuestChatRequest,
        choices: QuestChoice[]
    ): boolean {
        if (choices.length === 1 && choices[0] !== undefined) {
            this.submitChoice(request, choices[0])
        } else {
            this.replies.askWhichQuest(request, choices, 'submit')
        }
        return true
    }

    public submitChoice(request: QuestChatRequest, choice: QuestChoice): void {
        if (choice.source === 'board') {
            const order = request.orders.find(
                ({ entry }) =>
                    entry.id === choice.instanceId &&
                    entry.revision === choice.revision
            )
            if (order !== undefined) {
                this.submitDirect(request, order)
                return
            }
        } else {
            const job = request.jobs.find(
                ({ instanceId, revision }) =>
                    instanceId === choice.instanceId &&
                    revision === choice.revision
            )
            if (job !== undefined) {
                this.openOrExplain(request, job)
                return
            }
        }
        this.replies.clearQuestion(request)
        this.replies.say(
            request,
            'Это поручение изменилось или уже недоступно для сдачи.',
            'This quest has changed or is no longer available to turn in.'
        )
    }

    public openOrExplain(request: ReplyContact, job: NpcQuestSnapshot): void {
        if (!this.openJob(request, job)) {
            this.replies.rememberTopic(
                request,
                this.replies.choices.jobChoice(request.player, job)
            )
            this.replies.explain(request, job)
        }
    }

    public openJob(request: ReplyContact, job: NpcQuestSnapshot): boolean {
        const { issuer, player, now } = request
        const action = turnInPreviewAction(this.environment, player, job)
        if (action === undefined) {
            return false
        }
        this.replies.rememberTopic(
            request,
            this.replies.choices.jobChoice(player, job)
        )
        return this.show(
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
    }
}
