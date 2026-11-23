import {
    authoredMessages,
    type CombatWeapon,
    type ConstellationId,
    DISCLOSED_AUTHORED_TEXT_KEY,
    type GameLocale,
    type HeroClass,
    type ItemId,
    type LocalizedMessage,
    NPC_ENGLISH_NAMES,
} from '@my-game-ratata/contracts'
import { readonly } from 'vue'
import { createI18n } from 'vue-i18n'

import { automationMessages } from './automationMessages'
import { canvasMessages } from './canvasMessages'
import { characterMessages } from './characterMessages'
import { chatMessages } from './chatMessages'
import { conversationMessages } from './conversationMessages'
import { joinMessages, menuMessages, worldSettingsMessages } from './coreMessages'
import {
    abilityMessages,
    backgroundDescriptions,
    backgroundMessages,
    deityDomains,
    deityMessages,
    deityOmens,
    itemDescriptions,
    itemMessages,
    locationMessages,
    masteryMessages,
} from './gameCatalogs'
import { knowledgeMessages } from './knowledgeMessages'
import { questsMessages } from './questsMessages'
import { tradeMessages } from './tradeMessages'
import { worldActionMessages } from './worldActionMessages'
import { worldMessages } from './worldMessages'

type MessagePair = readonly [russian: string, english: string]
type GameMessages = typeof messages
type GameMessageKey = {
    [Group in keyof GameMessages]: `game.${Group}.${keyof GameMessages[Group] & string}`
}[keyof GameMessages]
type MessageParams = Record<string, string | number>

const preferenceKey = 'ratata.locale'
const messages = {
    ability: abilityMessages,
    automation: automationMessages,
    background: backgroundMessages,
    backgroundDescription: backgroundDescriptions,
    canvas: canvasMessages,
    character: characterMessages,
    chat: chatMessages,
    conversation: conversationMessages,
    deity: deityMessages,
    deityDomain: deityDomains,
    item: itemMessages,
    itemDescription: itemDescriptions,
    join: joinMessages,
    knowledge: knowledgeMessages,
    location: locationMessages,
    mastery: masteryMessages,
    menu: menuMessages,
    omen: deityOmens,
    quests: questsMessages,
    trade: tradeMessages,
    world: { ...worldMessages, ...worldActionMessages },
    worldSettings: worldSettingsMessages,
}

export const gameLocales = ['ru', 'en'] as const
export const gameLocaleNames = { ru: 'Русский', en: 'English' } as const

function catalog(language: GameLocale) {
    const index = language === 'ru' ? 0 : 1
    return {
        ...authoredMessages[language],
        [DISCLOSED_AUTHORED_TEXT_KEY]: '{text}',
        game: Object.fromEntries(
            Object.entries(messages).map(([group, groupMessages]) => [
                group,
                Object.fromEntries(
                    Object.entries<MessagePair>(groupMessages).map(([key, pair]) => [
                        key,
                        pair[index],
                    ])
                ),
            ])
        ),
    }
}

/** Russian choice formats use one/few/many. Two-form entries use singular/plural. */
function russianPlural(
    choice: number,
    choicesLength: number,
    originalRule?: (value: number, length: number) => number
): number {
    if (choicesLength !== 3) return originalRule?.(choice, choicesLength) ?? Number(choice !== 1)
    const units = Math.abs(choice) % 10
    const tens = Math.abs(choice) % 100
    if (units === 1 && tens !== 11) return 0
    if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return 1
    return 2
}

export const gameI18n = createI18n({
    legacy: false,
    locale: 'ru' as GameLocale,
    fallbackLocale: 'ru',
    flatJson: true,
    messages: { ru: catalog('ru'), en: catalog('en') },
    pluralRules: { ru: russianPlural },
})

const composer = gameI18n.global
export const gameLocale = readonly(composer.locale)

export function formatGameNumber(
    value: number | bigint,
    options?: Intl.NumberFormatOptions
): string {
    return new Intl.NumberFormat(gameLocale.value, options).format(value)
}

export function tGame(key: GameMessageKey, params?: MessageParams | number): string {
    if (typeof params === 'number') return composer.t(key, params)
    return params === undefined ? composer.t(key) : composer.t(key, params)
}

export function tLocalized(message: LocalizedMessage | undefined, fallback: string): string {
    if (!message || !composer.te(message.key, gameLocale.value)) return fallback
    if (fallback && gameLocale.value === 'ru' && message.key.startsWith('authored.'))
        return fallback
    return message.params === undefined
        ? composer.t(message.key)
        : composer.t(message.key, message.params)
}

export const abilityName = (id: string, fallback = id) =>
    tLocalized({ key: `game.ability.${id}` }, fallback)
export const backgroundName = (id: HeroClass) => tGame(`game.background.${id}`)
export const backgroundDescription = (id: HeroClass) => tGame(`game.backgroundDescription.${id}`)
export const itemName = (id: ItemId) => tGame(`game.item.${id}`)
export const itemDescription = (id: ItemId) => tLocalized({ key: `game.itemDescription.${id}` }, '')
export const locationName = (id: string, fallback = id) =>
    tLocalized({ key: `game.location.${id}` }, fallback)
export const characterName = (id: string, fallback = id) =>
    gameLocale.value === 'en' ? (NPC_ENGLISH_NAMES[id] ?? fallback) : fallback
export const masteryName = (id: ConstellationId) => tGame(`game.mastery.${id}`)

export function weaponName(kind: CombatWeapon['kind']): string {
    const keys = {
        knife: 'game.character.knifeAttack',
        natural: 'game.character.normalAttack',
        sword: 'game.character.swordAttack',
        axe: 'game.character.axeAttack',
        other: 'game.character.weaponAttack',
    } as const satisfies Record<CombatWeapon['kind'], GameMessageKey>
    return tGame(keys[kind])
}

function applyGameLocale(locale: GameLocale): void {
    composer.locale.value = locale
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale
    document.title = tGame('game.join.title')
}

export function initializeGameLocale(): void {
    let locale: GameLocale = 'ru'
    try {
        if (window.localStorage.getItem(preferenceKey) === 'en') locale = 'en'
    } catch {
        // Storage may be disabled. The language still works for this session.
    }
    applyGameLocale(locale)
}

export function setGameLocale(locale: GameLocale): void {
    applyGameLocale(locale)
    try {
        window.localStorage.setItem(preferenceKey, locale)
    } catch {
        // Keep the current choice even when the browser cannot persist it.
    }
}
