import type { ConstellationId } from '@my-game-ratata/contracts'

import { bladeBasicStars } from './constellationBladeBasics'
import { bladeJointStars } from './constellationBladeJoints'
import { bladeTechniqueStars } from './constellationBladeTechniques'
import { combatStars } from './constellationCombatStars'
import type { ConstellationStar } from './constellationDefinition'
import { magicStars } from './constellationMagicStars'
import { otherStars } from './constellationOtherStars'
import { stealthTheftStars } from './constellationStealthTheftStars'

export { type ConstellationStar, star } from './constellationDefinition'

export const constellationPaths = [
    {
        id: 'blade',
        name: 'Клинок',
        description:
            'Ступни находят опору, а клинок становится продолжением руки. Лишние движения уходят: в удар ложится вес всего тела, дыхание остаётся ровным, а чужой замах встречает готовую защиту.',
        color: '#edaa78',
    },
    {
        id: 'magic',
        name: 'Магия',
        description:
            'Вы направляете магию на защиту, перемещение и опасный для обеих сторон контроль поля боя.',
        color: '#b8a4ed',
    },
    {
        id: 'prayer',
        name: 'Угольная Мать',
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
        name: 'Скрытность',
        description:
            'Крадучись, вы двигаетесь тише, а наблюдатели замечают вас с меньшего расстояния. Подход со спины заметить труднее.',
        color: '#c4b2d7',
    },
    {
        id: 'theft',
        name: 'Воровство',
        description:
            'Крадучись, вы можете вытащить предмет из чужого кармана. Со спины риск поимки ниже и шанс вытащить вещь выше.',
        color: '#d7bf8f',
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
    {
        id: 'undead',
        name: 'Нежить',
        description:
            'Нежескелет поднимается на десяти HP. Магия скрепляет его кости, а победы закаляют тело и учат усваивать опыт павших.',
        color: '#9bc4aa',
    },
] satisfies Array<{
    id: ConstellationId
    name: string
    description: string
    color: string
}>

export const constellationStars: ConstellationStar[] = [
    ...bladeBasicStars,
    ...bladeTechniqueStars,
    ...bladeJointStars,
    ...combatStars,
    ...magicStars,
    ...otherStars,
    ...stealthTheftStars,
]
