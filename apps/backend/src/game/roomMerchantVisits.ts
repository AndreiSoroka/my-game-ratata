import {
    type ClientMessage,
    PUBLIC_SPEECH_RADIUS,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { findStandingApproach } from './characterSpacing'
import { isCityHerbCollector } from './cityHerbExchange'
import { CONVERSATION_REACH } from './conversationSessions'
import type { GameRoom } from './room'
import {
    MerchantDialogue,
    merchantOffersSale,
    merchantSaleIntent,
} from './roomMerchantDialogue'
import { canConverseWithNpc } from './socialSpeech'
import type { WhisperService } from './whispers'

const visitDuration = 12_000
const offerDuration = 25_000
const cancelCommands: ReadonlyArray<ClientMessage['type']> = [
    'interact',
    'whisper_open',
    'whisper_close',
    'dialogue_choice',
    'exchange_invite',
]

interface MerchantVisit {
    shopper: GameCharacter
    merchant: GameCharacter
    locationId: string
    shopperDeath: number
    merchantDeath: number
    deadline: number
    tryAt: number
    path?: Vector2[]
}

/** An addressed sale request may ask a merchant to take a short walk to the shopper. */
export class RoomMerchantVisits {
    private readonly visits = new Map<string, MerchantVisit>()
    private readonly offers = new Map<
        string,
        { merchantId: string; until: number }
    >()
    private readonly contact: MerchantDialogue

    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        whispers: WhisperService
    ) {
        this.contact = new MerchantDialogue(room, adventure, whispers)
    }

    public heardPublic(
        shopper: GameCharacter,
        text: string,
        now: number,
        targets: readonly string[] | undefined,
        handleQuest: () => boolean
    ): boolean {
        const [merchantId, other] = targets ?? []
        return merchantId !== undefined && other === undefined
            ? this.heard(
                  shopper,
                  this.room.getCharacter(merchantId),
                  text,
                  now,
                  handleQuest,
                  PUBLIC_SPEECH_RADIUS
              )
            : handleQuest()
    }

    public heard(
        shopper: GameCharacter,
        merchant: GameCharacter | undefined,
        text: string,
        now: number,
        handleQuest: () => boolean,
        range = CONVERSATION_REACH
    ): boolean {
        if (
            shopper.controllerKind !== 'network_player' ||
            merchant === undefined ||
            !isCityHerbCollector(merchant) ||
            !canConverseWithNpc(
                merchant,
                shopper,
                this.room.navigationFor(shopper),
                now,
                range
            )
        ) {
            return handleQuest()
        }
        const offer = this.offers.get(shopper.id)
        this.offers.delete(shopper.id)
        const intent = merchantSaleIntent(
            merchant,
            text,
            offer?.merchantId === merchant.id && now < offer.until
        )
        if (intent === 'open') {
            this.begin(shopper, merchant, now)
            return true
        }
        if (handleQuest()) {
            return true
        }
        if (intent === 'offer') {
            this.contact.reply(
                shopper,
                merchant,
                {
                    ru: 'Хочешь открыть продажу лечебных трав?',
                    en: 'Shall I open the sale window for medicinal herbs?',
                },
                now
            )
            this.recordOffer(merchant, shopper, now)
        }
        return intent === 'offer'
    }

    public offered(
        merchant: GameCharacter,
        shopper: GameCharacter,
        text: string,
        now: number,
        delivered = true
    ): void {
        if (delivered && merchantOffersSale(merchant, text)) {
            this.recordOffer(merchant, shopper, now)
        }
    }

    private recordOffer(
        merchant: GameCharacter,
        shopper: GameCharacter,
        now: number
    ): void {
        this.offers.set(shopper.id, {
            merchantId: merchant.id,
            until: now + offerDuration,
        })
    }

    public has(merchantId: string): boolean {
        return this.visits.has(merchantId)
    }

    public observeCommand(actorId: string, type: ClientMessage['type']): void {
        if (cancelCommands.includes(type)) {
            this.cancelFor(actorId)
        }
    }

    public cancelFor(actorId: string | undefined): void {
        if (actorId === undefined) {
            return
        }
        this.offers.delete(actorId)
        for (const visit of this.visits.values()) {
            if (visit.shopper.id === actorId || visit.merchant.id === actorId) {
                this.finish(visit)
            }
        }
    }

    public reconcile(now: number): void {
        for (const [shopperId, { until }] of this.offers) {
            if (now >= until) {
                this.offers.delete(shopperId)
            }
        }
        for (const visit of this.visits.values()) {
            if (!this.available(visit)) {
                this.finish(visit)
            } else if (now >= visit.deadline) {
                this.finish(visit)
                this.contact.reply(
                    visit.shopper,
                    visit.merchant,
                    {
                        ru: 'Не получается подойти. Подойди ко мне, и я открою продажу.',
                        en: 'I cannot get closer. Come to me and I can open the sale window.',
                    },
                    now
                )
            }
        }
    }

    public advance(merchant: GameCharacter, now: number): boolean {
        const visit = this.visits.get(merchant.id)
        if (visit === undefined) {
            return false
        }
        if (
            this.room.findVisibleTarget(merchant, 240, now) !== undefined ||
            (visit.path !== undefined &&
                merchant.path !== visit.path &&
                merchant.path.length > 0)
        ) {
            this.finish(visit)
            return false
        }
        if (this.contact.openIfClose(visit.shopper, merchant, now)) {
            this.finish(visit)
            return true
        }
        if (now >= visit.tryAt) {
            this.route(visit, now)
        }
        return true
    }

    private route(visit: MerchantVisit, now: number): void {
        const { merchant, shopper } = visit
        visit.tryAt = now + 250
        const approach = findStandingApproach(
            merchant,
            shopper,
            this.room,
            CONVERSATION_REACH,
            merchant.path === visit.path
        )
        if (approach.kind === 'approaching') {
            merchant.setPath(approach.path)
            if (merchant.path === approach.path) {
                visit.path = approach.path
            }
        }
    }

    public stop(): void {
        for (const visit of this.visits.values()) {
            this.finish(visit)
        }
        this.offers.clear()
    }

    private available(visit: MerchantVisit): boolean {
        const { shopper, merchant } = visit
        return (
            shopper.deathSequence === visit.shopperDeath &&
            merchant.deathSequence === visit.merchantDeath &&
            this.contact.available(shopper, merchant, visit.locationId)
        )
    }

    private begin(
        shopper: GameCharacter,
        merchant: GameCharacter,
        now: number
    ): void {
        if (this.contact.refuseIfClosed(shopper, merchant, now)) {
            return
        }
        const pending = this.visits.get(merchant.id)
        if (pending?.shopper === shopper) {
            return
        }
        if (
            pending !== undefined ||
            this.contact.servingAnother(shopper, merchant) ||
            this.room.social.exchanges.isBusy(merchant.id) ||
            this.room.social.exchanges.isBusy(shopper.id)
        ) {
            this.contact.reply(
                shopper,
                merchant,
                {
                    ru: 'Сейчас я занята. Позови меня чуть позже.',
                    en: 'I am busy just now. Ask me again in a moment.',
                },
                now
            )
            return
        }
        const current = this.adventure.walletFor(shopper.id).dialogue
        if (current !== null && current.npcId !== merchant.id) {
            return
        }
        this.cancelFor(shopper.id)
        this.room.social.npcSpeech.turns.close(shopper.id)
        if (!this.contact.openIfClose(shopper, merchant, now)) {
            this.visits.set(merchant.id, {
                shopper,
                merchant,
                locationId: shopper.locationId,
                shopperDeath: shopper.deathSequence,
                merchantDeath: merchant.deathSequence,
                deadline: now + visitDuration,
                tryAt: now,
            })
        }
    }

    private finish(visit: MerchantVisit): void {
        if (visit.path !== undefined && visit.merchant.path === visit.path) {
            visit.merchant.clearPath()
        }
        this.visits.delete(visit.merchant.id)
    }
}
