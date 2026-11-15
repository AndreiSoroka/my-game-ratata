import {
    type ConstellationId,
    GRAVE_PURIFY_STEPS,
    PRAYER_RULES,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
} from '@my-game-ratata/contracts'

import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import type { ConstellationEffectChance } from './constellationChanceTypes'
import { prayerChanceExamples } from './constellationPrayerChanceExamples'

const schools: Partial<Record<ConstellationId, PrayerAbilityId>> = {
    prayer: 'pray',
    prayer_road: 'pray_road',
    prayer_lantern: 'pray_lantern',
    prayer_grave: 'pray_grave',
}
const schoolInfo = {
    pray: {
        god: 'Угольная Мать',
        faith: 'Вера',
        miracles: 'Чудеса',
        resource: 'HP',
        power: '6 + 2 × (Чудеса − 1)',
    },
    pray_road: {
        god: 'Безымянный Путник',
        faith: 'Вера странника',
        miracles: 'Чудеса странника',
        resource: 'EN',
        power: '15 + 3 × (Чудеса странника − 1)',
    },
    pray_lantern: {
        god: 'Слепой Архивариус',
        faith: 'Вера ясности',
        miracles: 'Чудеса ясности',
        resource: 'MP',
        power: '12 + 2 × (Чудеса ясности − 1)',
    },
    pray_grave: {
        god: 'Хранитель Праха',
        faith: 'Вера праха',
        miracles: 'Чудеса праха',
        resource: 'HP нежити',
        power: '6 + 2 × (Чудеса праха − 1)',
    },
}
const answerFormula =
    'Pответа = min(95%, Bнастроения + (Вера своей школы − 1) × 1,5 п.п.); B: благосклонность 80%, нейтральное настроение 55%, гнев 25%.'
const qualityFormula = 'Qнастроения: благосклонность 1,3; нейтральное настроение 1; гнев 0,65.'
const purificationFormula = `Pшага = min(95%, 20% × Pответа / 55%); очищение требует ${GRAVE_PURIFY_STEPS} успешных шагов.`
const harmFormula = `Pкары = min(95%, Pответа + ${PRAYER_RULES.harmChanceBonus * 100} п.п.).`
const healingMultiplier =
    'Mлечения = 1 + 0,05 × I(Тёплый дар) + 0,05 × I(Щедрый дар) + 0,10 × I(Последний огонёк и выполнены его условия).'
const harmPower = `Урон кары до поглощения = round((6 + 2 × max(0, Чудеса − ${PRAYER_RULES.harmLevel})) × Qнастроения × (1 + 0,30 × I(Суровый ответ) + 0,30 × I(Гнев небес))).`
const oneRoll =
    'На завершённую молитву берётся один r ∈ [0, 1). Он общий для лечения, кары и шагов очищения, а также для всех подходящих целей; отдельных бросков по целям нет.'
const indicatorLegend =
    'I(...) = 1, когда указанная звезда изучена и её условия выполнены; иначе 0.'
const faithAndPower =
    'Вера своей школы меняет шанс ответа; Чудеса своей школы меняют силу. Уровни навыков в игре — от 1 до 10.'

/** Static debug explanation only; no current deity mood, character state or hidden practice is read. */
export function describePrayerEffectChance(
    node: ConstellationStar
): ConstellationEffectChance | undefined {
    const ability = schools[node.constellationId]
    if (ability === undefined) return undefined
    if (node.kind === 'root') return rootChance(ability)
    if (node.id.endsWith('.revive')) return revivalChance(ability)
    if (node.id.startsWith('prayer.harm')) return harmChance(node.id)
    if (['prayer.gift1', 'prayer.gift2', 'prayer.last_light'].includes(node.id))
        return giftChance(node.id)
    if (node.id.startsWith('prayer.radius')) return radiusChance(node.id)
    if (node.id === 'prayer.focus') return focusChance()
    if (node.id === 'prayer.area') return areaChance()
    if (node.id.startsWith('prayer.omen') || node.id.startsWith('prayer.others'))
        return insightChance(node.id)
    return undefined
}

function rootChance(ability: PrayerAbilityId): ConstellationEffectChance {
    const info = schoolInfo[ability]
    const definition = PRAYER_SCHOOL_DEFINITIONS[ability]
    return {
        summary: `Ответ божества «${info.god}» вероятностный: ${info.faith} и его настроение определяют шанс восстановления ${info.resource}.`,
        formulas: [
            answerFormula,
            `r < Pответа: восстановление ${info.resource} = min(нехватка ресурса, round((${info.power}) × Qнастроения × M)); M = ${ability === 'pray' ? 'Mлечения' : '1'}.`,
            qualityFormula,
            ...(ability === 'pray' ? [healingMultiplier, purificationFormula] : []),
        ],
        examples: prayerChanceExamples(info.faith, ability === 'pray' ? 'grave' : 'answer'),
        notes: [
            `Используются ${info.faith} (${definition.faithSkillId}), ${info.miracles} (${definition.miracleSkillId}) и настроение только своего бога (${definition.deityId}). Выбор покровителя в HUD эту привязку не меняет.`,
            faithAndPower,
            oneRoll,
            ...(ability === 'pray'
                ? [
                      'Пять шагов очищения не обязаны идти подряд; отказ сохраняет уже набранный прогресс. Каждый удачный бросок добавляет один шаг каждой подходящей могиле.',
                      indicatorLegend,
                  ]
                : [
                      'Модификаторы созвездия «Молитва», включая кару и общую молитву, эту школу не усиливают.',
                  ]),
            'При r ≥ Pответа дар не срабатывает. Эти вероятности относятся к завершённой допустимой молитве; отмена не бросает r.',
        ],
    }
}

function revivalChance(ability: PrayerAbilityId): ConstellationEffectChance {
    const info = schoolInfo[ability]
    return {
        summary: `Воскрешение использует тот же шанс ответа: ${info.faith} и настроение божества «${info.god}».`,
        formulas: [
            answerFormula,
            'Pвоскрешения = Pответа; успех при r < Pответа.',
            'После успеха HP = max(1, ceil(максимальное HP × 0,5)); MP и EN = 0,5 × соответствующий максимум.',
        ],
        examples: prayerChanceExamples(info.faith),
        notes: [
            oneRoll,
            `${info.miracles} и множители лечения не меняют шанс воскрешения или стандартную половину ресурсов. Нужна подходящая душа в пределах окна воскрешения и прочие условия режима.`,
        ],
    }
}

function deterministic(
    summary: string,
    formulas: string[],
    examples: ConstellationEffectChance['examples'] = []
): ConstellationEffectChance {
    return {
        summary,
        formulas: [
            'Pприменения изученного модификатора = 100% при выполнении его условий.',
            ...formulas,
            answerFormula,
        ],
        examples,
        notes: [
            '100% относится к применению модификатора. Сам дар молитвы по-прежнему требует ответа божества; его вероятность этот модификатор не увеличивает.',
            faithAndPower,
            indicatorLegend,
        ],
    }
}

function radiusChance(id: string): ConstellationEffectChance {
    const cells = id === 'prayer.radius2' ? 2 : 1
    return deterministic(
        'Радиус увеличивается постоянно; дополнительного броска нет.',
        ['R = 48 px + ширина клетки текущей карты × (I(Дальний голос) + I(Голос над долиной)).'],
        [
            {
                label: 'Пример: ширина клетки 16 px',
                value: `${cells} изученных увеличения: R = ${48 + cells * 16} px; применение 100%.`,
            },
        ]
    )
}
function focusChance(): ConstellationEffectChance {
    return deterministic(
        'Сосредоточение всегда сокращает канал молитвы на 10%.',
        [
            'T = round(3000 мс × (1 − 0,10 × I(Сосредоточение))). Следующая попытка доступна сразу после окончания канала.',
        ],
        [{ label: 'Со Сосредоточением', value: 'T = 2700 мс; применение 100%.' }]
    )
}
function giftChance(id: string): ConstellationEffectChance {
    const lastLight = id === 'prayer.last_light'
    const result = deterministic(
        lastLight
            ? 'Последний огонёк даёт условный гарантированный бонус силы; успех самого лечения остаётся вероятностным.'
            : 'Изученный дар гарантированно усиливает успешное обычное лечение; шанс ответа сохраняется.',
        [
            healingMultiplier,
            'HPвосстановлено = min(нехватка HP, round((6 + 2 × (Чудеса − 1)) × Qнастроения × Mлечения)).',
            qualityFormula,
            ...(lastLight
                ? [
                      'I(Последний огонёк) = 1 только при HP < 20% максимума, сохранённых вражеских ранах и пересечении порога из-за вражеского удара; условия фиксируются до исцеления.',
                  ]
                : []),
        ],
        [
            {
                label: 'Тёплый дар / оба дара',
                value: 'M = 1,05 / 1,10; с обоими дарами и активным Последним огоньком M = 1,20.',
            },
            ...(lastLight
                ? [
                      {
                          label: 'Чудеса 1, нейтральное настроение, Тёплый дар и активный Последний огонёк',
                          value: 'Сила: round(6 × 1,15) = 7 HP; при Вере 1 ответ всё ещё 55%.',
                      },
                  ]
                : []),
        ]
    )
    result.notes.push(
        'Бонус усиливает обычное лечение HP. Воскрешение сохраняет стандартную половину ресурсов; новые открытия этой молитвы не меняют уже рассчитанный дар.'
    )
    return result
}
function harmChance(id: string): ConstellationEffectChance {
    return {
        summary:
            id === 'prayer.harm'
                ? 'Кара срабатывает по более высокому порогу, чем лечебный ответ.'
                : 'Множитель урона кары применяется со 100% вероятностью, если сама кара сработала.',
        formulas: [
            ...(id === 'prayer.harm'
                ? []
                : ['Pприменения изученного множителя урона = 100% при сработавшей Каре.']),
            answerFormula,
            harmFormula,
            'Кара действует при r < Pкары; у всех подходящих жертв один общий бросок.',
            harmPower,
            qualityFormula,
        ],
        examples: prayerChanceExamples(schoolInfo.pray.faith, 'harm'),
        notes: [
            oneRoll,
            indicatorLegend,
            'Кара может сработать при отказе лечебного дара, если Pответа ≤ r < Pкары. Все подходящие цели — нежить в радиусе и прямой видимости; сторона цели не меняет порог.',
            'Кара доступна после открытия звезды. При Чудесах 1–3 её базовая сила равна 6, а с 4 растёт на 2 за уровень.',
            'Суровый ответ даёт Mурона = 1,30; вместе с Гневом небес Mурона = 1,60. Множители не повышают шанс кары; барьер может поглотить рассчитанный урон.',
        ],
    }
}
function areaChance(): ConstellationEffectChance {
    return {
        summary:
            'Общая молитва всегда расширяет выбор целей; ответ и шаги очищения остаются вероятностными.',
        formulas: [
            'Pвыбора всех подходящих союзников и могил в радиусе = 100%.',
            answerFormula,
            'Каждый подходящий союзник получает дар при r < Pответа.',
            purificationFormula,
            'Каждая подходящая могила получает +1 шаг при r < Pшага.',
        ],
        examples: prayerChanceExamples(schoolInfo.pray.faith, 'grave'),
        notes: [
            oneRoll,
            `Очищение требует ${GRAVE_PURIFY_STEPS} накопленных успешных шагов, не обязательно подряд. У каждого союзника лечение ограничено его нехваткой HP.`,
            'Воскрешение сохраняет одну выбранную цель; кара и без Общей молитвы проверяет всю подходящую нежить в радиусе.',
        ],
    }
}
function insightChance(id: string): ConstellationEffectChance {
    const others = id.startsWith('prayer.others')
    const rank = Number(id.at(-1))
    const information = [
        'намёк на настроение',
        'точное настроение',
        'вероятность ответа',
        'время до смены настроения',
    ][rank - 1]
    return {
        summary: `После открытия ${information} ${others ? 'других богов' : 'Угольной Матери'} раскрывается постоянно, со 100% вероятностью.`,
        formulas: [
            'Pраскрытия доступной информации = 100%; дополнительного броска нет.',
            ...(rank === 3 ? [answerFormula] : []),
            ...(rank === 4 ? ['Осталось мс = 30000 − (серверное время мс mod 30000).'] : []),
        ],
        examples:
            rank === 3
                ? prayerChanceExamples(schoolInfo.pray.faith).map((example) => ({
                      ...example,
                      label: others
                          ? example.label.replace('Вера', 'Вера школы божества')
                          : example.label,
                  }))
                : [
                      {
                          label: 'Раскрытие после открытия звезды',
                          value: '100% при наличии соответствующего уровня знания.',
                      },
                  ],
        notes: [
            'Знание настроения раскрывает информацию, сохраняя прежнюю вероятность ответа.',
            ...(others
                ? [
                      'Для каждого другого бога вероятность считается по Вере его собственной школы; таблица примеров использует такие же уровни Веры.',
                  ]
                : []),
        ],
    }
}
