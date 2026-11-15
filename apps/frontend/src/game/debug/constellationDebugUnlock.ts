import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import {
    constellationPaths,
    type ConstellationStar,
} from '../../../../backend/src/game/constellationCatalog'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'

export interface ConstellationUnlockDescription {
    conditions: string[]
    chanceBoosts: string[]
}

const teacherReach =
    'При обучении учитель и ученик — разные живые персонажи одной фракции, в одной локации; расстояние не больше 64 пикселей, есть прямая видимость.'
const studentReady = 'При самостоятельном обучении ученик готов к действию: не оглушён и не занят.'
const rootAutomatic =
    'Корень открывается автоматически, без случайного выбора и расхода прогресса созвездия.'

const rootConditions: Record<string, string[]> = {
    'blade.root': [
        'Стартовый класс Воин (vanguard) ИЛИ первая учтённая практика навыка «Владение мечом» (swordsmanship).',
    ],
    'magic.root': [
        'Стартовый класс Маг (arcanist) ИЛИ изучена «Искра» (spark) или «Барьер» (barrier).',
        'При обучении Искре или Барьеру у учителя должна быть метка scholar.',
        teacherReach,
        studentReady,
    ],
    'prayer.root': [
        'Стартовый класс Клерик ИЛИ изучена «Молитва» (pray).',
        'При обучении учитель должен знать именно «Молитву» (pray).',
        teacherReach,
        studentReady,
    ],
    'arrow.root': [
        'Стартовый класс Лучник (ranger) ИЛИ изучен «Выстрел» (shot).',
        'При обучении учитель должен иметь метку veteran или идентификатор npc_veteran_1.',
        teacherReach,
        studentReady,
    ],
    'life.root': [
        'Получен реальный враждебный урон здоровью ИЛИ учтённая практика навыка «Жизненный опыт» (vitality).',
    ],
    'shadow.root': [
        'Получена первая учтённая практика «Скрытности» (stealth) или «Воровства» (theft).',
    ],
    'prayer_road.root': [
        'Изучена «Молитва странника» (pray_road).',
        'При обучении учитель должен знать именно «Молитву странника» (pray_road).',
        teacherReach,
        studentReady,
    ],
    'prayer_lantern.root': [
        'Изучена «Молитва ясности» (pray_lantern).',
        'При обучении учитель должен знать именно «Молитву ясности» (pray_lantern).',
        teacherReach,
        studentReady,
    ],
    'prayer_grave.root': [
        'Изучена «Молитва праха» (pray_grave).',
        'При обучении учитель должен знать именно «Молитву праха» (pray_grave).',
        teacherReach,
        studentReady,
    ],
}

const specialConditions: Record<string, string[]> = {
    'magic.fireball': [
        '«Магические знания» (arcana) не ниже 3; Огненный шар ещё не изучен.',
        'Путь 1: готовый к действию ученик обучается у персонажа с меткой scholar.',
        'Путь 2: готовый к действию учитель, уже знающий Огненный шар, обучает ученика.',
        teacherReach,
        'Открывается непосредственно при обучении, без случайного выбора и прогресса созвездия.',
    ],
    'magic.greater_fireball': [
        'Навык «Огненный шар» (fireball) достиг 10 уровня.',
        'Открывается автоматически при начислении практики, без случайного выбора и прогресса созвездия.',
    ],
    'prayer.revive': [
        'Изучена «Молитва» (pray).',
        'Класс Клерик ИЛИ навык «Чудеса» (miracles) не ниже 5.',
        'Режим воскрешения открывается автоматически, без случайного выбора и прогресса созвездия.',
    ],
    'prayer_grave.revive': [
        'Изучена «Молитва праха» (pray_grave).',
        'Класс Клерик ИЛИ навык «Чудеса праха» (grave_miracles) не ниже 5.',
        'Режим воскрешения открывается автоматически, без случайного выбора и прогресса созвездия.',
    ],
    'prayer.last_light': [
        'Уже открыты «Тёплый дар» (prayer.gift1) и «Прислушаться к телу» (life.hp1).',
        'До исцеления у самого молящегося строго меньше 20% максимального HP; этот порог пересечён из-за вражеского урона, и остались учтённые вражеские раны.',
        'Завершённая «Молитва» (pray) дала полезный дар здоровья себе или подходящему союзнику, либо успешно воскресила союзника.',
        'Открывается по этому событию, без случайного выбора и расхода прогресса созвездия.',
    ],
    'magic.runic_echo': [
        'Уже открыты «Яркая искра» (magic.spark_damage) и «Твёрдая рука» (arrow.damage1).',
        'После последнего полезного попадания Искрой или одним из огненных шаров нужно полезное попадание Выстрелом по той же цели не позднее чем через 5000 мс (5 секунд включительно).',
        'Оба попадания должны нанести реальный враждебный урон; попадания по тренировочной мишени не засчитываются.',
        'Открывается по этой последовательности, без случайного выбора и расхода прогресса созвездия.',
    ],
}

const evidenceNames: Record<string, string> = {
    swordsmanship: 'учтённая практика Владения мечом',
    arcana: 'учтённая практика Магических знаний',
    barrier: 'полезное поглощение вражеского урона Барьером',
    fireball: 'учтённая практика Огненного шара',
    greater_fireball: 'учтённая практика Большого огненного шара',
    marksmanship: 'учтённая практика Стрельбы',
    gift: 'полезные дары здоровья молитвы',
    harm: 'полезный урон кары',
    purify: 'успешные шаги очищения могил',
    wound: 'учтённая практика от вражеских ран',
    recovery: 'учтённая практика восстановления после вражеских ран',
    stealth: 'учтённая практика Скрытности',
    theft: 'учтённая практика Воровства',
}

/** Debug-only explanation of authoritative unlock rules; never added to ordinary snapshots/cards. */
export function describeConstellationUnlock(nodeId: string): ConstellationUnlockDescription {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (node === undefined) return { conditions: [], chanceBoosts: [] }
    const root = rootConditions[nodeId]
    if (root !== undefined) return { conditions: [...root, rootAutomatic], chanceBoosts: [] }
    const special = specialConditions[nodeId]
    if (special !== undefined) return { conditions: [...special], chanceBoosts: [] }
    return { conditions: ordinaryConditions(node), chanceBoosts: evidenceBoosts(node) }
}

function ordinaryConditions(node: ConstellationStar): string[] {
    const path = constellationPaths.find((entry) => entry.id === node.constellationId)
    const parents = node.parents.map((id) => {
        const parent = fullConstellationCatalog.find((entry) => entry.id === id)
        return `«${parent?.name ?? id}» (${id})`
    })
    return [
        `Открыты все предшественники: ${parents.join(', ')}.`,
        `Есть хотя бы 1 непотраченная единица прогресса созвездия «${path?.name ?? node.constellationId}», полученная за повышение его навыков.`,
        'Завершено учитываемое осмысленное действие этой ветви; звезда участвует в случайном выборе среди подходящих кандидатов этого действия.',
        ...(node.constellationId === 'prayer'
            ? [
                  'Для обычных звёзд Молитвы подходит и осмысленная попытка, на которую божество не ответило.',
              ]
            : []),
        'При выборе тратится 1 единица прогресса; за действие выбирается не более одной обычной звезды.',
        ...(node.ability === undefined
            ? []
            : [
                  `Изучена способность «${ABILITY_DEFINITIONS[node.ability].name}» (${node.ability}).`,
              ]),
    ]
}

function evidenceBoosts(node: ConstellationStar): string[] {
    if (node.evidence.length === 0) return []
    return [
        `Накопленные события: ${node.evidence.map((key) => evidenceNames[key] ?? key).join('; ')}.`,
        'Они не обязательны: вес звезды равен 1 + min(5, сумма счётчиков этих событий), то есть от 1 до 6. Это относительный вес случайного выбора.',
    ]
}
