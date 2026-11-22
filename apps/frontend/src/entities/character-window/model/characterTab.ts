export const characterTabs = [
    { id: 'stats', label: 'Характеристики' },
    { id: 'development', label: 'Развитие' },
    { id: 'quests', label: 'Квесты' },
    { id: 'crafting', label: 'Ремесло' },
] as const

export type CharacterTab = (typeof characterTabs)[number]['id']
