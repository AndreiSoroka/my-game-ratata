import { QUICK_SHOT_RULES } from '@my-game-ratata/contracts'

import { star } from './constellationDefinition'

export const combatStars = [
    star(
        'magic',
        'spark_damage',
        'Яркая искра',
        'Урон Искры увеличен на 10%.',
        ['root'],
        ['arcana'],
        'spark'
    ),
    star(
        'magic',
        'spark_range',
        'Длинная нить',
        'Дальность Искры увеличена на одну клетку.',
        ['root'],
        ['arcana'],
        'spark'
    ),
    star(
        'magic',
        'spark_economy',
        'Тонкое плетение',
        'Искра стоит на 1 MP меньше.',
        ['root'],
        ['arcana'],
        'spark'
    ),
    star(
        'magic',
        'barrier_strength',
        'Крепкая грань',
        'Барьер тратит 0,8 MP вместо 1 MP за единицу поглощённого урона.',
        ['root'],
        ['barrier'],
        'barrier'
    ),
    star(
        'magic',
        'barrier_duration',
        'Долгая защита',
        'Барьер действует на секунду дольше.',
        ['barrier_strength'],
        ['barrier'],
        'barrier'
    ),
    {
        ...star(
            'magic',
            'fire_damage',
            'Жар',
            'Огненная стрела и Большой огненный шар наносят на 10% больше урона.',
            ['root'],
            ['fireball', 'greater_fireball'],
            'fireball'
        ),
        minimumLevel: 3,
    },
    star(
        'magic',
        'mana1',
        'Чувство маны',
        'Мана оценивается с шагом 25, шкала делится на семь сегментов.'
    ),
    star(
        'magic',
        'mana2',
        'Поток маны',
        'Мана оценивается с шагом 10, шкала делится на десять сегментов.',
        ['mana1']
    ),
    star(
        'magic',
        'mana3',
        'Знание маны',
        'Точно известен текущий и максимальный запас маны.',
        ['mana2']
    ),
    star(
        'magic',
        'insight',
        'Магическое чутьё',
        'Точно известна сила и темп изученных заклинаний.'
    ),
    star(
        'arrow',
        'damage1',
        'Твёрдая рука',
        'Урон Быстрого выстрела увеличен на 10%.',
        ['root'],
        ['marksmanship']
    ),
    star(
        'arrow',
        'damage2',
        'Верный выстрел',
        'Урон Быстрого выстрела увеличен ещё на 10%.',
        ['damage1'],
        ['marksmanship']
    ),
    star(
        'arrow',
        'range1',
        'Дальний взгляд',
        'Дальность Быстрого выстрела увеличена на одну клетку.'
    ),
    star(
        'arrow',
        'range2',
        'Горизонт',
        'Дальность Быстрого выстрела увеличена ещё на одну клетку.',
        ['range1']
    ),
    star(
        'arrow',
        'economy',
        'Экономный выстрел',
        `Быстрый выстрел стоит на ${String(QUICK_SHOT_RULES.energyDiscount)} EN меньше.`
    ),
    star(
        'arrow',
        'tempo',
        'Быстрая стрела',
        'Интервал между Быстрыми выстрелами короче на 10%.'
    ),
    star(
        'arrow',
        'critical',
        'Уязвимое место',
        'Критический шанс Быстрого выстрела выше на 3 процентных пункта.'
    ),
    star(
        'arrow',
        'insight1',
        'Чувство стрелы',
        'Урон обоих выстрелов оценивается с шагом 2.'
    ),
    star(
        'arrow',
        'insight2',
        'Знание стрелы',
        'Точно известны урон, темп и критический шанс обоих выстрелов.',
        ['insight1']
    ),
]
