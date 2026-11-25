import {
    CITY_HERB_COLLECTOR_IDS,
    type GameLocale,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import { resolveAdventureNpc } from './adventureNpc'
import type { GameCharacter } from './character'
import { isCityHerbCollector } from './cityHerbExchange'
import { cityTradeRefusal } from './crimeRules'
import { afterNpcSpokenName } from './npcSpeechNames'
import type { GameRoom } from './room'
import { speechAvailable } from './socialSpeech'
import { createDialogueSpeechEvent } from './speechReceipts'
import type { WhisperService } from './whispers'

export class MerchantDialogue {
    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        private readonly whispers: WhisperService
    ) {}

    public available(
        shopper: GameCharacter,
        merchant: GameCharacter,
        locationId: string
    ): boolean {
        if (
            this.room.getCharacter(shopper.id) !== shopper ||
            this.room.getCharacter(merchant.id) !== merchant ||
            shopper.locationId !== locationId ||
            merchant.locationId !== locationId ||
            !speechAvailable(shopper) ||
            !isCityHerbCollector(merchant) ||
            this.room.social.exchanges.isBusy(shopper.id) ||
            this.room.social.exchanges.isBusy(merchant.id)
        ) {
            return false
        }
        const dialogue = this.adventure.walletFor(shopper.id).dialogue
        return (
            dialogue === null ||
            (dialogue.npcId === merchant.id &&
                dialogue.initialView === undefined)
        )
    }

    public servingAnother(
        shopper: GameCharacter,
        merchant: GameCharacter
    ): boolean {
        return this.room.charactersFor(merchant).some((actor) => {
            if (
                actor === shopper ||
                actor.controllerKind !== 'network_player'
            ) {
                return false
            }
            const dialogue = this.adventure.walletFor(actor.id).dialogue
            return (
                dialogue?.npcId === merchant.id &&
                dialogue.initialView !== undefined
            )
        })
    }

    public reply(
        shopper: GameCharacter,
        merchant: GameCharacter,
        lines: Record<GameLocale, string>,
        now: number
    ): void {
        const language = this.room.localeFor(shopper.id)
        const text = lines[language]
        if (
            !this.whispers.send(merchant, shopper, text, now, {
                language,
                keepOriginalForRecipient: true,
            })
        ) {
            this.room.publishEvents([
                {
                    kind: 'notice',
                    actorId: shopper.id,
                    audienceIds: [shopper.id],
                    text,
                },
            ])
        }
    }
    public refuseIfClosed(
        shopper: GameCharacter,
        merchant: GameCharacter,
        now: number
    ): boolean {
        const cityRefusal = this.adventure.cities.tradeRefusal(
            shopper.locationId
        )
        const refusal = cityRefusal ?? cityTradeRefusal(shopper)
        if (refusal === undefined) {
            return false
        }
        this.reply(
            shopper,
            merchant,
            {
                ru: refusal,
                en:
                    cityRefusal === undefined
                        ? 'City merchants cannot trade with you right now.'
                        : 'City trading opens when the Bell of Memory rings.',
            },
            now
        )
        return true
    }
    public openIfClose(
        shopper: GameCharacter,
        merchant: GameCharacter,
        now: number
    ): boolean {
        const navigation = this.room.navigationFor(shopper)
        const nearby = this.room.charactersFor(shopper)
        if (
            resolveAdventureNpc(
                shopper,
                merchant.id,
                nearby,
                now,
                navigation
            ) === undefined
        ) {
            return false
        }
        if (this.refuseIfClosed(shopper, merchant, now)) {
            return true
        }
        this.room.scenarios.pause(shopper)
        const result = this.adventure.interactResult(
            shopper,
            merchant.id,
            nearby,
            navigation,
            now,
            'sell'
        )
        const dialogue = this.adventure.walletFor(shopper.id).dialogue
        if (result.accepted && dialogue !== null) {
            const speech = createDialogueSpeechEvent(
                merchant,
                shopper,
                this.room.localeFor(shopper.id) === 'en'
                    ? 'Here is what I can buy.'
                    : 'Вот что я могу купить.'
            )
            dialogue.speechId = speech.speechId
            this.room.publishEvents([...result.events, speech])
        }
        return true
    }
}

export function merchantSaleIntent(
    merchant: GameCharacter,
    text: string,
    invited: boolean
): 'open' | 'offer' | undefined {
    const words = normalize(
        afterNpcSpokenName(merchant.id, merchant.nickname, text) ?? text
    )
    if (saleRequest(words) || (invited && affirmative(words))) {
        return 'open'
    }
    if (
        /(?:^| )(?:прин[ео]с(?:ла|ли)?|принесу|как сдать|куда сдать) (?:лечебные )?трав\p{L}*(?: |$)/u.test(
            words
        )
    ) {
        return 'offer'
    }
    return undefined
}

export function merchantOffersSale(
    merchant: GameCharacter,
    text: string
): boolean {
    const words = normalize(text)
    return (
        CITY_HERB_COLLECTOR_IDS.includes(merchant.id) &&
        /(?:хочешь|хотите|открыть ли|shall i|would you like)/u.test(words) &&
        /(?:продаж|продат|sell|sale)/u.test(words)
    )
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
}

function saleRequest(words: string): boolean {
    return (
        !/(?:^| )(?:не (?:хочу|буду|надо|нужно|прода\p{L}*)|don t sell|not selling)(?: |$)/u.test(
            words
        ) &&
        /(?:^| )(?:продать|на продажу|продажу|купишь (?:лечебные )?травы|покупаешь (?:лечебные )?травы|sell|sale)(?: |$)/u.test(
            words
        )
    )
}

function affirmative(words: string): boolean {
    return /^(?:да|ага|давай(?:те)?|хочу|открывай|да (?:давай|открывай|хочу)|yes(?: please)?|sure|go ahead)$/u.test(
        words
    )
}
