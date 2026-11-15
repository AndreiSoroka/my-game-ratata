import type { ConstellationId } from '@my-game-ratata/contracts'

import { combatStars } from './constellationCombatStars'
import type { ConstellationStar } from './constellationDefinition'
import { otherStars } from './constellationOtherStars'

export { type ConstellationStar, star } from './constellationDefinition'

export const constellationPaths = [
    {
        id: 'blade',
        name: 'Клинок',
        description:
            'Вы владеете ближним оружием и оттачиваете мастерство ударов.',
        color: '#edaa78',
    },
    {
        id: 'magic',
        name: 'Магия',
        description:
            'Вы направляете магическую силу, чтобы поражать врагов и защищаться.',
        color: '#b8a4ed',
    },
    {
        id: 'prayer',
        name: 'Молитва',
        description:
            'Вы можете помолиться за живых или мёртвых. Есть шанс, что божество ответит на ваши просьбы.',
        color: '#eddb9b',
    },
    {
        id: 'arrow',
        name: 'Стрела',
        description: 'Вы поражаете цели на расстоянии.',
        color: '#9ed4db',
    },
    {
        id: 'life',
        name: 'Жизнь',
        description: 'Вы лучше понимаете своё тело и учитесь беречь силы.',
        color: '#b5da9a',
    },
    {
        id: 'shadow',
        name: 'Тень',
        description:
            'Вы умеете скрывать своё присутствие и действовать незаметно.',
        color: '#c4b2d7',
    },
    {
        id: 'prayer_road',
        name: 'Путь странника',
        description:
            'Вы обращаетесь к Безымянному Путнику за силами для дальнейшего пути. Есть шанс восстановить энергию себе или союзнику.',
        color: '#9fcab0',
    },
    {
        id: 'prayer_lantern',
        name: 'Ясность',
        description:
            'Вы просите Слепого Архивариуса прояснить разум. Есть шанс восстановить ману себе или союзнику.',
        color: '#a8bfea',
    },
    {
        id: 'prayer_grave',
        name: 'Прах',
        description:
            'Вы обращаетесь к Хранителю Праха. Есть шанс восстановить здоровье себе или союзнику, принадлежащему к нежити.',
        color: '#b7a3cf',
    },
] satisfies Array<{
    id: ConstellationId
    name: string
    description: string
    color: string
}>

export const constellationStars: ConstellationStar[] = [
    ...combatStars,
    ...otherStars,
]
