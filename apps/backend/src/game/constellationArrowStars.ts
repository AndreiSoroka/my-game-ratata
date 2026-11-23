import { type ConstellationStar, star } from './constellationDefinition'

const lore: Record<string, string> = {
    damage3: 'Стрелок проводит тетиву дальше, сохраняя твёрдую руку.',
    economy2: 'Привычное движение требует всё меньше усилий.',
    tempo2: 'Свободная рука успевает подобрать стрелу, пока лук ещё отзывается.',
    critical2: 'Небольшой просвет теперь достаточно велик для стрелы.',
    series1:
        'Каждое удачное попадание подсказывает, куда направить следующую стрелу.',
    series2:
        'Взгляд остаётся на противнике, пока рука снова натягивает тетиву.',
    sniper_range1: 'Стрелок учится оценивать расстояние по знакомым предметам.',
    sniper_range2: 'Взгляд различает цель у дальней границы поля.',
    sniper_windup1: 'Спокойное дыхание помогает раньше поймать цель.',
    sniper_windup2: 'За короткий вдох рука находит нужное положение.',
    sniper_economy1: 'Расслабленное плечо помогает удерживать натяжение.',
    sniper_economy2: 'Даже после долгого прицела у стрелка остаются силы.',
    sniper_tempo1: 'Следующая стрела находится на ощупь.',
    sniper_tempo2: 'Долгая подготовка сменяется короткой передышкой.',
    sniper_critical1: 'Даже вдали стрелок замечает открытое место.',
    sniper_critical2:
        'Меткий глаз различает маленькую цель на большом расстоянии.',
    sniper_opening: 'Свежая рука особенно уверена перед первым выстрелом.',
    sniper_long_range:
        'Опыт дальнего боя позволяет использовать всю силу лука.',
    moving_damage1: 'Стрелок выпускает тетиву в такт шагу.',
    moving_damage2: 'Натяжение остаётся сильным с каждым шагом.',
    moving_critical1: 'Ровная поступь облегчает точный выпуск стрелы.',
    moving_critical2: 'Стрелок учится находить просвет даже на ходу.',
    moving_dash1: 'Выпустив стрелу, стрелок готов отойти с прежней линии огня.',
    moving_dash2: 'Ноги быстро возвращаются к привычной опоре после выстрела.',
    moving_speed1: 'Удачный выстрел помогает быстрее сменить место.',
    moving_speed2: 'Стрелок пользуется короткой передышкой противника.',
    moving_followup1:
        'Дальнее попадание помогает заметить уязвимое место при сближении.',
    moving_followup2: 'Перемена угла позволяет снова поразить ту же цель.',
}

function arrowStar(
    id: string,
    name: string,
    result: string,
    minimumLevel: number,
    parents: string[],
    practice: string
): ConstellationStar {
    return {
        ...star('arrow', id, name, lore[id] ?? result, parents, [practice]),
        minimumLevel,
        ...(lore[id] === undefined ? {} : { results: [result] }),
    }
}

const quick = [
    arrowStar(
        'damage3',
        'Полный натяг',
        'Урон Быстрого выстрела увеличен ещё на 5%.',
        6,
        ['damage2'],
        'quick_shot'
    ),
    arrowStar(
        'economy2',
        'Мягкая тетива',
        'Быстрый выстрел стоит ещё на 1 EN меньше.',
        4,
        ['economy'],
        'quick_shot'
    ),
    arrowStar(
        'tempo2',
        'Стрела за стрелой',
        'Интервал между Быстрыми выстрелами сокращён ещё на 5 процентных пунктов.',
        4,
        ['tempo'],
        'quick_shot'
    ),
    arrowStar(
        'critical2',
        'Точная рука',
        'Критический шанс Быстрого выстрела выше ещё на 2 процентных пункта.',
        4,
        ['critical'],
        'quick_shot'
    ),
    arrowStar(
        'series1',
        'Держать цель',
        'Следующий Быстрый выстрел по той же цели в течение 3 секунд после полезного Быстрого попадания наносит на 10% больше урона.',
        2,
        ['root'],
        'quick_shot'
    ),
    arrowStar(
        'series2',
        'Череда стрел',
        'Бонус серии Быстрых выстрелов по той же цели увеличен ещё на 5 процентных пунктов.',
        4,
        ['series1'],
        'quick_shot'
    ),
]

const sniper: ConstellationStar = {
    ...arrowStar(
        'sniper_shot',
        'Снайперский выстрел',
        'Вы останавливаетесь, чтобы поразить выбранную цель издалека.',
        2,
        ['root'],
        'marksmanship'
    ),
    kind: 'ability',
    effectType: 'active',
    activationAbilityId: 'sniper_shot',
}

function sniperStar(
    id: string,
    name: string,
    result: string,
    minimumLevel: number,
    parents = ['sniper_shot']
): ConstellationStar {
    return arrowStar(id, name, result, minimumLevel, parents, 'sniper_shot')
}

const sniperUpgrades = [
    sniperStar(
        'sniper_range1',
        'Дальняя метка',
        'Дальность Снайперского выстрела увеличена на одну клетку.',
        3
    ),
    sniperStar(
        'sniper_range2',
        'На краю поля',
        'Дальность Снайперского выстрела увеличена ещё на одну клетку.',
        5,
        ['sniper_range1']
    ),
    sniperStar(
        'sniper_windup1',
        'Ровное дыхание',
        'Прицеливание Снайперского выстрела короче на 75 мс.',
        3
    ),
    sniperStar(
        'sniper_windup2',
        'Тихий вдох',
        'Прицеливание Снайперского выстрела короче ещё на 75 мс.',
        5,
        ['sniper_windup1']
    ),
    sniperStar(
        'sniper_economy1',
        'Свободное плечо',
        'Снайперский выстрел стоит на 2 EN меньше.',
        3
    ),
    sniperStar(
        'sniper_economy2',
        'Выдержка',
        'Снайперский выстрел стоит ещё на 2 EN меньше.',
        5,
        ['sniper_economy1']
    ),
    sniperStar(
        'sniper_tempo1',
        'Новая стрела',
        'Боевой откат Снайперского выстрела короче на 100 мс.',
        3
    ),
    sniperStar(
        'sniper_tempo2',
        'Привычный натяг',
        'Боевой откат Снайперского выстрела короче ещё на 100 мс.',
        5,
        ['sniper_tempo1']
    ),
    sniperStar(
        'sniper_critical1',
        'В просвет',
        'Критический шанс Снайперского выстрела выше на 3 процентных пункта.',
        3
    ),
    sniperStar(
        'sniper_critical2',
        'Ясная метка',
        'Критический шанс Снайперского выстрела выше ещё на 2 процентных пункта.',
        5,
        ['sniper_critical1']
    ),
    sniperStar(
        'sniper_opening',
        'Первый натяг',
        'Снайперский выстрел наносит на 15% больше урона после пяти секунд без оплаченной атаки.',
        5,
        ['sniper_windup1']
    ),
    sniperStar(
        'sniper_long_range',
        'За горизонтом',
        'Снайперский выстрел наносит на 20% больше урона при попадании с восьми клеток и дальше.',
        8,
        ['sniper_range2', 'sniper_windup2']
    ),
]

const moving: ConstellationStar = {
    ...star(
        'arrow',
        'moving_shot',
        'Выстрел на ходу',
        'Рука находит момент для выстрела, пока ноги продолжают шаг.'
    ),
    acquisition: 'event',
    minimumLevel: 4,
    results: [
        'Быстрый выстрел больше не останавливает обычную ходьбу. Стрела выходит из текущей позиции в выбранном направлении.',
    ],
}

function movingStar(
    id: string,
    name: string,
    result: string,
    minimumLevel: number,
    parents = ['moving_shot']
): ConstellationStar {
    return arrowStar(id, name, result, minimumLevel, parents, 'moving_shot')
}

const movingUpgrades = [
    movingStar(
        'moving_damage1',
        'Уверенный шаг',
        'Быстрый выстрел на ходу наносит на 5% больше урона.',
        5
    ),
    movingStar(
        'moving_damage2',
        'Сила шага',
        'Бонус урона Быстрого выстрела на ходу увеличен ещё на 5 процентных пунктов.',
        7,
        ['moving_damage1']
    ),
    movingStar(
        'moving_critical1',
        'Ровный шаг',
        'Критический шанс Быстрого выстрела на ходу выше на 2 процентных пункта.',
        5
    ),
    movingStar(
        'moving_critical2',
        'Меткость в движении',
        'Критический шанс Быстрого выстрела на ходу выше ещё на 2 процентных пункта.',
        7,
        ['moving_critical1']
    ),
    movingStar(
        'moving_dash1',
        'Уход с линии',
        'Полезное попадание Быстрым выстрелом на ходу сокращает оставшийся откат рывка на 150 мс.',
        5
    ),
    movingStar(
        'moving_dash2',
        'Быстрый отрыв',
        'Полезное попадание Быстрым выстрелом на ходу сокращает оставшийся откат рывка ещё на 150 мс.',
        7,
        ['moving_dash1']
    ),
    movingStar(
        'moving_speed1',
        'Лёгкая поступь',
        'После полезного попадания Быстрым выстрелом на ходу скорость обычного шага выше на 5% в течение 600 мс.',
        5
    ),
    movingStar(
        'moving_speed2',
        'Лёгкий уход',
        'Ускорение шага после полезного попадания Быстрым выстрелом на ходу увеличено ещё на 5 процентных пунктов.',
        7,
        ['moving_speed1']
    ),
    movingStar(
        'moving_followup1',
        'Смена позиции',
        'Следующий Быстрый выстрел на ходу по той же цели в течение четырёх секунд после полезного Снайперского попадания наносит на 10% больше урона.',
        7,
        ['moving_damage2', 'sniper_shot']
    ),
    movingStar(
        'moving_followup2',
        'Новый угол',
        'Бонус урона Смены позиции увеличен ещё на 10 процентных пунктов.',
        9,
        ['moving_followup1']
    ),
]

/** Appended after the existing catalog so existing wire IDs remain stable. */
export const arrowExpansionStars = [
    ...quick,
    sniper,
    ...sniperUpgrades,
    moving,
    ...movingUpgrades,
]
