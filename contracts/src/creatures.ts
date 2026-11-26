export type CharacterArchetype = 'human' | 'skeleton' | 'slime' | 'fat_zombie'

/** D&D 5e creature categories; behavior and allegiances are independent data. */
export const creatureTypes = [
    'aberration',
    'beast',
    'celestial',
    'construct',
    'dragon',
    'elemental',
    'fey',
    'fiend',
    'giant',
    'humanoid',
    'monstrosity',
    'ooze',
    'plant',
    'undead',
] as const

export type CreatureType = (typeof creatureTypes)[number]

export const creatureTypeLabels: Record<CreatureType, string> = {
    aberration: 'Аберрация',
    beast: 'Зверь',
    celestial: 'Небожитель',
    construct: 'Конструкт',
    dragon: 'Дракон',
    elemental: 'Элементаль',
    fey: 'Фея',
    fiend: 'Исчадие',
    giant: 'Великан',
    humanoid: 'Гуманоид',
    monstrosity: 'Чудовище',
    ooze: 'Слизь',
    plant: 'Растение',
    undead: 'Нежить',
}

export const archetypeCreatureTypes: Record<CharacterArchetype, CreatureType> =
    {
        human: 'humanoid',
        skeleton: 'undead',
        fat_zombie: 'undead',
        slime: 'ooze',
    }

export function isCreatureType(value: unknown): value is CreatureType {
    return (
        typeof value === 'string' &&
        creatureTypes.some((type) => type === value)
    )
}

/** A rules-defined group for these patrons, not a universal biological property. */
export const livingCreatureTypes: readonly CreatureType[] =
    creatureTypes.filter((type) => type !== 'undead' && type !== 'construct')
