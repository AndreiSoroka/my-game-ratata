import type {
    AssistancePolicy,
    CharacterVisualId,
    CreatureType,
} from '@my-game-ratata/contracts'

import type { TileCoordinate } from './navigation'

interface CityResident {
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
        id: 'npc_weaver_1',
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
        nickname: 'Травница Злата',
        tile: { x: 56, y: 60 },
        visualId: 'female_mage',
        greeting:
            'Я Злата. Травы растут рядом с площадью, а сад — на юго-западе. В походе еда и помощь клерика важнее тяжёлого кошелька.',
        personality:
            'Заботливая травница бережёт жителей и предпочитает свой тихий дом.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_baker_1',
        nickname: 'Пекарь Елисей',
        tile: { x: 26, y: 18 },
        visualId: 'male_player_2',
        greeting:
            'Елисей. После ночной дороги хорошо вернуться в тёплый дом. Запасы продаёт Савва: его лавка к югу от площади.',
        personality:
            'Приветливый пекарь любит домашний покой и слушает истории путешественников.',
    },
    {
        creatureType: 'humanoid',
        id: 'npc_cartographer_1',
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
        nickname: 'Ткач Тихон',
        tile: { x: 66, y: 18 },
        visualId: 'male_player_2',
        greeting:
            'Тихон. Проходи, только не наступи на ткань. Если ищешь спутника, загляни в «Три дороги»: там останавливаются Бран и Лея.',
        personality:
            'Спокойный ткач рад гостям, но не считает себя бойцом и не покидает дом.',
    },
]
