import { star } from './constellationDefinition'

/** Authored resurrection upgrades; their levels do not depend on graph depth. */
export const revivalStars = [
    star(
        'prayer',
        'revive_higher',
        'Высшее воскрешение',
        'Воскрешение возвращает 75% максимального здоровья.',
        ['revive'],
        [],
        'pray'
    ),
    star(
        'prayer',
        'revive_experienced',
        'Опытное воскрешение',
        'Шанс успешного воскрешения увеличен на 10 процентных пунктов.',
        ['revive'],
        [],
        'pray'
    ),
    {
        ...star(
            'prayer',
            'revive_master',
            'Мастер воскрешений',
            'Шанс успешного воскрешения увеличен ещё на 10 процентных пунктов.',
            ['revive_experienced'],
            [],
            'pray'
        ),
        minimumLevel: 12,
    },
    {
        ...star(
            'prayer',
            'revive_angelic',
            'Ангельское воскрешение',
            'После успешного воскрешения с вероятностью 30% возвращает по 150% максимального здоровья, маны и энергии.',
            ['revive_experienced', 'revive_higher'],
            [],
            'pray'
        ),
        minimumLevel: 12,
    },
    star(
        'prayer',
        'revive_stable',
        'Стабильное воскрешение',
        'После успешного воскрешения возвращает не менее 100% максимального здоровья. Шанс воскрешения увеличен на 5 процентных пунктов.',
        ['revive_experienced', 'revive_higher'],
        [],
        'pray'
    ),
]
