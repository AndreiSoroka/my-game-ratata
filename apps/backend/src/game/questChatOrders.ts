import type {
    GameLocale,
    NpcQuestSnapshot,
    QuestBoardEntry,
} from '@my-game-ratata/contracts'

import type { BoardQuest, QuestBoardCatalog } from './questBoardCatalog'
import type { QuestChatRequest } from './questChat'
import type { QuestChatReplies, ReplyContact } from './questChatReplies'
import {
    activeQuestList,
    localizedQuestText,
    localizedQuestTitle,
    namedQuest,
    unnamedStatus,
} from './questChatWords'
import type { QuestTurnInEnvironment } from './questTurnInRules'
import { availableItemQuantity } from './rewardReservations'

export class QuestChatOrders {
    public constructor(
        private readonly environment: QuestTurnInEnvironment,
        private readonly catalog: QuestBoardCatalog,
        private readonly replies: QuestChatReplies
    ) {}

    public heard(
        request: QuestChatRequest,
        speech: 'details' | 'recommend' | 'take' | 'status'
    ): boolean {
        switch (speech) {
            case 'details':
                return this.describeBoard(request)
            case 'recommend':
                return this.recommend(request)
            case 'take':
                return this.take(request)
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
        this.replies.say(
            contact,
            `«${localizedQuestTitle(entry, 'ru')}»${progress}. ${entry.source === 'story' ? 'Для сдачи нужны три сердца из рюкзака.' : entry.description}${other}`,
            `“${localizedQuestTitle(entry, 'en')}”${progress}. ${entry.source === 'story' ? 'Bring the three hearts from your bag.' : entry.description}${otherEn}`
        )
    }

    private recommend(request: QuestChatRequest): boolean {
        const { player, issuer, now } = request
        const current =
            this.environment.quests.snapshot(player.id, now).questOffer ?? null
        if (current !== null) {
            if (current.issuerId === issuer.id) {
                this.introduce(request, current)
            } else {
                this.replies.say(
                    request,
                    'У тебя уже открыты условия другого заказчика. Реши, берёшь ли то поручение.',
                    'You already have an offer from another quest giver. Decide whether to take that one first.'
                )
            }
            return true
        }
        const orders = this.catalog.offerable(player, now)
        const order =
            orders.find(({ entry }) => entry.id === 'slime_hunt') ?? orders[0]
        if (
            order !== undefined &&
            this.catalog.offer(issuer, player, order, now).accepted
        ) {
            this.introduce(request, order.entry)
            return true
        }
        const group = this.environment.parties.contractGroup(player.id)
        if (group.occupied) {
            this.replies.say(
                request,
                'У твоей группы уже есть действующий договор. Сейчас другого поручения для тебя нет.',
                'Your party already has an active contract. I have no other quest to offer you right now.'
            )
        } else if (group.leaderId !== player.id) {
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
        return true
    }

    private introduce(
        request: ReplyContact,
        quest: Parameters<typeof localizedQuestTitle>[0]
    ): void {
        this.replies.say(
            request,
            `Могу предложить «${localizedQuestTitle(quest, 'ru')}». Вот условия.`,
            `I can offer “${localizedQuestTitle(quest, 'en')}”. Here are the terms.`
        )
    }

    private take(request: QuestChatRequest): boolean {
        const { player, issuer, orders, text, now } = request
        const matches = orders.filter(({ entry }) => namedQuest(text, entry))
        const match = matches.length === 1 ? matches[0] : undefined
        if (match !== undefined) {
            const offer = this.catalog.offer(issuer, player, match, now)
            if (!offer.accepted) {
                this.replies.say(
                    request,
                    offer.error ?? 'Заказ недоступен.',
                    'The order is unavailable.'
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
                (matches.length > 1
                    ? matches
                    : this.catalog.offerable(player, now)
                ).map(({ entry }) => entry)
            )
            return true
        }
        return false
    }

    private status(request: QuestChatRequest): boolean {
        const { issuer, player, jobs, orders, text, now } = request
        const named = jobs.filter((job) =>
            this.replies.matchesJob(player, job, text)
        )
        const specified = orders.filter(({ entry }) => namedQuest(text, entry))
        if (named.length + specified.length > 1) {
            this.replies.askWhich(request, [
                ...named,
                ...specified.map(({ entry }) => entry),
            ])
            return true
        }
        if (specified[0] !== undefined) {
            this.describeOrder(request, specified[0])
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

function boardDetails(
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
