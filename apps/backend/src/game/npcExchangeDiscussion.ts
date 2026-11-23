import type { ExchangeSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { companionProfiles } from './companionProfiles'
import type { NpcHeardSpeech } from './roomNpcConversations'

export interface NpcExchangeOffer {
    exchangeId: string
    offerRevision: number
}

/** Dialogue is bound to the partner's current proposal, independent of our own edits. */
export class NpcExchangeDiscussion {
    private readonly questions = new WeakMap<
        GameCharacter,
        { offer: NpcExchangeOffer; answered: boolean }
    >()

    public recordSpeech(
        actor: GameCharacter,
        speaker: GameCharacter,
        exchange: ExchangeSnapshot | null,
        event: NpcHeardSpeech
    ): NpcHeardSpeech {
        const offer =
            exchange?.partnerId === speaker.id && isTradeDialogue(event)
                ? offeredItems(exchange)
                : undefined
        if (offer === undefined) {
            return event
        }
        const question = this.questions.get(actor)
        if (question !== undefined && sameOffer(question.offer, offer)) {
            question.answered = true
        }
        return { ...event, exchangeOffer: offer }
    }

    public recordInquiry(
        actor: GameCharacter,
        event: NpcHeardSpeech,
        text: string,
        exchange: ExchangeSnapshot | null
    ): void {
        const offer =
            exchange?.partnerId === event.senderId
                ? offeredItems(exchange)
                : undefined
        if (
            offer !== undefined &&
            sameOffer(event.exchangeOffer, offer) &&
            /[?？]/u.test(text)
        ) {
            this.questions.set(actor, { offer, answered: false })
        }
    }

    public problem(
        actor: GameCharacter,
        exchange: ExchangeSnapshot | null
    ): string | undefined {
        const offer = offeredItems(exchange)
        if (offer === undefined) {
            return undefined
        }
        const question = this.questions.get(actor)
        if (!sameOffer(question?.offer, offer)) {
            return 'Сначала спроси, для чего тебе предлагают эти вещи, или откажись от условий.'
        }
        return question?.answered === true
            ? undefined
            : 'Дождись ответа собеседника на твой вопрос об этих вещах.'
    }
}

function sameOffer(
    left: NpcExchangeOffer | undefined,
    right: NpcExchangeOffer
): boolean {
    return (
        left?.exchangeId === right.exchangeId &&
        left.offerRevision === right.offerRevision
    )
}

export function offeredItems(
    exchange: ExchangeSnapshot | null
): NpcExchangeOffer | undefined {
    return exchange?.status === 'active' &&
        exchange.other.items.length > 0 &&
        exchange.other.revision !== undefined
        ? {
              exchangeId: exchange.id,
              offerRevision: exchange.other.revision,
          }
        : undefined
}

export function considersItems(actorId: string): boolean {
    return companionProfiles[actorId]?.discussIncomingItems === true
}

function isTradeDialogue(event: NpcHeardSpeech): boolean {
    return (
        event.system !== true &&
        (event.id.startsWith('say:') ||
            event.id.startsWith('whisper:') ||
            event.id.startsWith('talk:'))
    )
}
