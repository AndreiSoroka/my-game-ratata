import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    type ConstellationId,
    type DeityId,
    getWorldLocationDefinition,
    HERO_BACKGROUND_DEFINITIONS,
    type HeroClass,
    ITEM_DEFINITIONS,
    type ItemId,
    MASTERY_NAMES,
    WORLD_LOCATION_ENGLISH_NAMES,
} from '@my-game-ratata/contracts'

export const backgroundMessages = {
    vanguard: [HERO_BACKGROUND_DEFINITIONS.vanguard.name, 'Vanguard'],
    ranger: [HERO_BACKGROUND_DEFINITIONS.ranger.name, 'Ranger'],
    arcanist: [HERO_BACKGROUND_DEFINITIONS.arcanist.name, 'Arcanist'],
    cleric: [HERO_BACKGROUND_DEFINITIONS.cleric.name, 'Cleric'],
} as const satisfies Record<HeroClass, readonly [string, string]>

export const backgroundDescriptions = {
    vanguard: [
        HERO_BACKGROUND_DEFINITIONS.vanguard.description,
        'Years on the front line built a strong body and taught you the basics of the Blade.',
    ],
    ranger: [
        HERO_BACKGROUND_DEFINITIONS.ranger.description,
        'Life on the road built your stamina and taught you the basics of the Arrow.',
    ],
    arcanist: [
        HERO_BACKGROUND_DEFINITIONS.arcanist.description,
        'Studying spells expanded your mana reserve and taught you the basics of Magic.',
    ],
    cleric: [
        HERO_BACKGROUND_DEFINITIONS.cleric.description,
        'A life of service taught you to pray and bring fallen companions back.',
    ],
} as const satisfies Record<HeroClass, readonly [string, string]>

function withAuthoredRussian<Key extends string>(
    english: Record<Key, string>,
    source: (id: Key) => string
) {
    return Object.fromEntries(
        (Object.keys(english) as Key[]).map((id) => [id, [source(id), english[id]] as const])
    ) as Record<Key, readonly [string, string]>
}

export const abilityMessages = withAuthoredRussian(
    {
        wide_swing: 'Wide swing',
        circular_swing: 'Circular swing',
        lunge: 'Lunge',
        pommel_strike: 'Pommel strike',
        defensive_stance: 'Defensive stance',
        pray: 'Prayer',
        pray_woven: 'Woven prayer',
        pray_road: 'Wanderer’s prayer',
        pray_lantern: 'Prayer of clarity',
        pray_grave: 'Prayer of ashes',
        ash_raise: 'Raise skeleton',
        ash_order: 'Command skeleton',
        ash_gift: 'Gift of ash',
        ash_sacrifice: 'Ash sacrifice',
        ash_heart: 'Lich’s heart',
        spark: 'Spark',
        barrier: 'Barrier',
        shot: 'Quick shot',
        sniper_shot: 'Sniper shot',
        skeleton_strike: 'Bone strike',
        fireball: 'Firebolt',
        greater_fireball: 'Greater fireball',
        chains: 'Chains',
        blink: 'Blink',
        dispel_magic: 'Dispel magic',
        city_portal: 'Portal',
    } satisfies Record<AbilityId, string>,
    (id) => ABILITY_DEFINITIONS[id].name
)

export const masteryMessages = withAuthoredRussian(
    {
        blade: 'Blade',
        magic: 'Magic',
        prayer: 'Coal Mother',
        arrow: 'Arrow',
        life: 'Life',
        shadow: 'Shadow',
        prayer_road: 'Wanderer’s Path',
        prayer_lantern: 'Clarity',
        prayer_grave: 'Ash',
        undead: 'Undead',
    } satisfies Record<ConstellationId, string>,
    (id) => MASTERY_NAMES[id]
)

const russianItemNames: Partial<Record<ItemId, string>> = {
    boots: 'Старые сапоги',
    food: 'Яблоко',
    old_sword: 'Старый меч',
    simple_sword: 'Простой меч',
}

export const itemMessages = withAuthoredRussian(
    {
        lich_heart: 'Lich’s heart',
        bone: 'Bone',
        axe: 'Axe',
        stone_axe: 'Stone axe',
        pickaxe: 'Pickaxe',
        stone: 'Stone',
        brushwood: 'Brushwood',
        sapling: 'Sapling',
        herbs: 'Medicinal herbs',
        grain: 'Grain',
        wheat_seed: 'Wheat seeds',
        fiber: 'Fiber',
        scrap: 'Scrap metal',
        wood: 'Timber',
        slime_heart: 'Slime heart',
        boots: 'Old Boots',
        food: 'Apple',
        old_sword: 'Old Sword',
        simple_sword: 'Simple Sword',
    } satisfies Record<ItemId, string>,
    (id) => russianItemNames[id] ?? ITEM_DEFINITIONS[id].name
)

type DescribedItemId = Exclude<ItemId, 'boots' | 'food' | 'old_sword' | 'simple_sword'>
export const itemDescriptions = withAuthoredRussian(
    {
        lich_heart: 'A heart sealed in ash. The bond lasts as long as it remains in its own chest.',
        bone: 'A skeleton bone. Can serve as proof for a worker’s request.',
        axe: 'Chops trees with little wear. Can be used in combat.',
        stone_axe: 'An inexpensive axe. Chops wood, but wears out sooner than an iron axe.',
        pickaxe: 'A sturdy tool for mining stone.',
        stone: 'Mined stone. Occupies a separate inventory slot.',
        brushwood: 'Dry twigs for kindling and city heating. Stacks up to 9 per slot.',
        sapling:
            'Plant on clear ground to grow a mature forest tree in 10 minutes. Remove any stump first.',
        herbs: 'An ingredient for trail food. Stacks up to 9 per slot.',
        grain: 'Harvested wheat for baking bread. Stacks up to 9 per slot.',
        wheat_seed:
            'Use one seed to sow a wheat plot. Found in chests and sometimes collected with the harvest. Stacks up to 9 per slot.',
        fiber: 'Tough plant fiber used in crafting.',
        scrap: 'Metal used to make weapons.',
        wood: 'A crafting material. Occupies a separate inventory slot.',
        slime_heart: 'A heart from a hostile slime. Bring three to Mira for the Bell of Memory.',
    } satisfies Record<DescribedItemId, string>,
    (id) => ITEM_DEFINITIONS[id].description ?? ''
)

export const locationMessages = withAuthoredRussian(
    WORLD_LOCATION_ENGLISH_NAMES,
    (id) => getWorldLocationDefinition(id)?.name ?? id
)

export const deityMessages = {
    grave: ['Хранитель Праха', 'Ash Guardian'],
    hearth: ['Угольная Мать', 'Coal Mother'],
    lantern: ['Слепой Архивариус', 'Blind Archivist'],
    road: ['Безымянный Путник', 'Nameless Wanderer'],
} as const satisfies Record<DeityId, readonly [string, string]>

export const deityDomains = {
    grave: ['Покой нежити и холод живым', 'Rest for the undead and cold for the living'],
    hearth: ['Исцеление и возвращение к жизни', 'Healing and restoration of life'],
    lantern: ['Ясность мысли и восстановление маны', 'Clarity of mind and mana recovery'],
    road: ['Выносливость и дальняя дорога', 'Endurance and long journeys'],
} as const satisfies Record<DeityId, readonly [string, string]>

export const deityOmens = {
    benevolent: [
        'Знаки обещают благосклонность, но не дают гарантий.',
        'The signs suggest favor, but offer no guarantees.',
    ],
    neutral: [
        'Знаки противоречивы. Ответ божества неясен.',
        'The signs conflict. The deity’s answer is unclear.',
    ],
    wrathful: [
        'В знаках чувствуется раздражение. Чуда можно не дождаться.',
        'The signs suggest displeasure. A miracle may never come.',
    ],
    vague: [
        'Знаки едва различимы. Воля божества непостижима.',
        'The signs are barely discernible. The deity’s will is unknowable.',
    ],
} as const
