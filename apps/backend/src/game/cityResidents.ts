import type {
    AssistancePolicy,
    CharacterVisualId,
    CreatureType,
} from '@my-game-ratata/contracts'

import type { TileCoordinate } from './navigation'

interface CityResident {
    anchorId?: string
    spawnOffset?: { x: number; y: number }
    idleRouteAnchors?: readonly string[]
    id: string
    nickname: string
    tile: TileCoordinate
    creatureType: CreatureType
    visualId: CharacterVisualId
    greeting: string
    personality: string
    assistancePolicy?: AssistancePolicy
    idleRouteTiles?: readonly TileCoordinate[]
}

export const cityResidents: CityResident[] = [
    {
        creatureType: 'humanoid',
        id: 'npc_wanderer_1',
        anchorId: 'service.inn',
        spawnOffset: { x: -16, y: 0 },
        idleRouteAnchors: [
            'service.inn',
            'resource.fiber',
            'service.guild',
            'service.herbalist',
        ],
        nickname: 'Бродяга Прохор',
        tile: { x: 39, y: 48 },
        visualId: 'male_player_2',
        greeting:
            'Прохор. Дома нет, срочных дел тоже. Давай познакомимся — после разговора могу помочь с простой работой.',
        personality:
            'Бродит по городским улицам. Помогает знакомым, но не сражается.',
        assistancePolicy: { kind: 'met' },
        idleRouteTiles: [
            { x: 39, y: 48 },
            { x: 45, y: 48 },
            { x: 45, y: 55 },
            { x: 39, y: 55 },
        ],
    },
    {
        creatureType: 'humanoid',
        id: 'npc_wanderer_2',
        anchorId: 'service.inn',
        spawnOffset: { x: -16, y: 16 },
        idleRouteAnchors: [
            'service.inn',
            'resource.herbs',
            'service.shop',
            'service.library',
        ],
        nickname: 'Бродяжка Дарья',
        tile: { x: 36, y: 53 },
        visualId: 'female_player',
        greeting:
            'Я Дарья. Пока скитаюсь по Новогороду. Помоги Мире собрать сердца для колокола памяти — тогда помогу и тебе.',
        personality:
            'Бродит по городу без работы. Доверяет тем, кто помог колоколу памяти; в бой не идёт.',
        assistancePolicy: {
            kind: 'quest_completed',
            questId: 'hearts-for-the-border-bell',
        },
        idleRouteTiles: [
            { x: 36, y: 53 },
            { x: 36, y: 59 },
            { x: 43, y: 59 },
            { x: 43, y: 53 },
        ],
    },
    {
        creatureType: 'humanoid',
        id: 'npc_weaver_1',
        anchorId: 'service.workshop',
        nickname: 'Мастерица Мила',
        tile: { x: 21, y: 31 },
        visualId: 'female_player',
        greeting:
            'Мила. В мастерской всегда есть работа. Собери волокно и древесину — снаряжение само себя не сделает. За стены без припасов не выходи.',
        personality:
            'Практичная мастерица любит порядок и остаётся у своего станка.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_smith_1',
        anchorId: 'service.smithy',
        nickname: 'Кузнец Игнат',
        tile: { x: 77, y: 50 },
        visualId: 'male_player_2',
        greeting:
            'Игнат. Словом стаю не остановишь. Сделай меч, возьми еды и найди товарищей. Даже ближние предместья не прощают беспечности.',
        personality:
            'Немногословный кузнец ценит подготовку и не бросает горн ради приключений.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_herbalist_1',
        anchorId: 'service.herbalist',
        nickname: 'Травница Злата',
        tile: { x: 56, y: 60 },
        visualId: 'female_mage',
        greeting:
            'Я Злата. Травы ищи у площади, а лекарский сад — рядом с моим домом. В походе еда и помощь клерика важнее тяжёлого кошелька.',
        personality:
            'Заботливая травница бережёт жителей и предпочитает свой тихий дом.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_baker_1',
        anchorId: 'service.baker',
        nickname: 'Пекарь Елисей',
        tile: { x: 26, y: 18 },
        visualId: 'male_player_2',
        greeting:
            'Елисей. После ночной дороги хорошо вернуться в тёплый дом. Запасы можно купить в городской лавке Саввы, когда торговля открыта.',
        personality:
            'Приветливый пекарь любит домашний покой и слушает истории путешественников.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_cartographer_1',
        anchorId: 'service.cartographer',
        nickname: 'Картограф Нестор',
        tile: { x: 77, y: 29 },
        visualId: 'male_mage',
        greeting:
            'Нестор. Каждая дорога от Новогорода уводит в более опасные земли. В углах моего атласа ещё возвращались не все. Держитесь вместе.',
        personality:
            'Осторожный картограф изучает рассказы вернувшихся и не выдаёт догадки за открытия.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_tailor_1',
        anchorId: 'service.weaver',
        nickname: 'Ткач Тихон',
        tile: { x: 66, y: 18 },
        visualId: 'male_player_2',
        greeting:
            'Тихон. Проходи, только не наступи на ткань. Если ищешь спутника, загляни в «Три дороги»: там останавливаются Бран и Лея.',
        personality:
            'Спокойный ткач рад гостям, но не считает себя бойцом и не покидает дом.',
    },
]
