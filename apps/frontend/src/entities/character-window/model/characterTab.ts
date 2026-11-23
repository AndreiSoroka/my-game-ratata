import { tGame } from '@/shared/lib/i18n'

export const characterTabs = [
    {
        id: 'stats',
        get label() {
            return tGame('game.character.stats')
        },
    },
    {
        id: 'development',
        get label() {
            return tGame('game.character.progression')
        },
    },
    {
        id: 'quests',
        get label() {
            return tGame('game.character.quests')
        },
    },
    {
        id: 'crafting',
        get label() {
            return tGame('game.character.crafting')
        },
    },
] as const

export type CharacterTab = (typeof characterTabs)[number]['id']
