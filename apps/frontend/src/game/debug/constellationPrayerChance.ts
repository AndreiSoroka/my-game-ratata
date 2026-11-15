import {
    GRAVE_PURIFY_STEPS,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
} from '@my-game-ratata/contracts'

import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import type {
    ConstellationChanceFormula,
    ConstellationEffectChance,
} from './constellationChanceTypes'
import { prayerChanceExamples } from './constellationPrayerChanceExamples'
import * as math from './constellationPrayerFormulas'
import { prayerAbilityForConstellation, prayerSchoolInfo } from './constellationPrayerScenario'

interface PrayerDescription extends Omit<ConstellationEffectChance, 'formulas' | 'formulaDetails'> {
    formulaDetails: ConstellationChanceFormula[]
}
const oneRoll =
    'На завершённую молитву берётся один случайный бросок от 0 включительно до 1 не включительно. Он общий для лечения, кары и шагов очищения, а также для всех подходящих целей; отдельных бросков по целям нет.'
const faithAndPower =
    'Мастерство определяет открытия звёзд. Вероятность и базовая сила зависят от настроения божества; изученные звёзды добавляют усиления.'

/** Static debug formulas only: settings for the example calculator live in a separate pure API. */
export function describePrayerEffectChance(
    node: ConstellationStar
): ConstellationEffectChance | undefined {
    const ability = prayerAbilityForConstellation(node.constellationId)
    if (ability === undefined) return undefined
    const description = describePrayer(node, ability)
    if (description === undefined) return undefined
    const { formulaDetails, ...text } = description
    return withChanceFormulas(text, formulaDetails)
}
function describePrayer(
    node: ConstellationStar,
    ability: PrayerAbilityId
): PrayerDescription | undefined {
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
function rootChance(ability: PrayerAbilityId): PrayerDescription {
    const info = prayerSchoolInfo[ability]
    const definition = PRAYER_SCHOOL_DEFINITIONS[ability]
    return {
        summary: `Молитва божеству «${info.god}» восстанавливает ${info.resource} с вероятностью, зависящей от его настроения.`,
        formulaDetails: [
            math.prayerAnswerFormula(ability),
            math.prayerRestorationFormula(ability),
            math.prayerAnswerRollFormula(),
            ...(ability === 'pray'
                ? [
                      math.prayerHealingMultiplierFormula(),
                      math.prayerPurificationFormula(),
                      chanceFormula('Успешных шагов до очищения', String(GRAVE_PURIFY_STEPS)),
                  ]
                : []),
        ],
        examples: prayerChanceExamples(info.masteryName, ability === 'pray' ? 'grave' : 'answer'),
        notes: [
            `Используется настроение только своего бога (${definition.deityId}). Выбор покровителя в HUD эту привязку не меняет.`,
            faithAndPower,
            oneRoll,
            ...(ability === 'pray'
                ? [
                      'Пять шагов очищения не обязаны идти подряд; отказ сохраняет уже набранный прогресс. Каждый удачный бросок добавляет один шаг каждой подходящей могиле.',
                  ]
                : [
                      'Модификаторы созвездия «Молитва», включая кару и общую молитву, эту школу не усиливают.',
                  ]),
            'Если бросок не прошёл порог ответа, дар не срабатывает. Вероятности относятся к завершённой допустимой молитве; отмена не делает бросок.',
        ],
    }
}
function revivalChance(ability: PrayerAbilityId): PrayerDescription {
    const info = prayerSchoolInfo[ability]
    return {
        summary: `Шанс воскрешения определяется настроением божества «${info.god}».`,
        formulaDetails: [
            math.prayerAnswerFormula(ability),
            math.prayerRevivalChanceFormula(),
            math.prayerAnswerRollFormula(),
            math.prayerRevivalHpFormula(),
            math.prayerRevivalResourceFormula(),
        ],
        examples: prayerChanceExamples(info.masteryName),
        notes: [
            oneRoll,
            'Множители лечения не меняют шанс воскрешения или стандартную половину ресурсов. Нужна подходящая душа в пределах окна воскрешения и прочие условия режима.',
        ],
    }
}
function deterministic(
    summary: string,
    formulaDetails: ConstellationChanceFormula[],
    examples: ConstellationEffectChance['examples'] = []
): PrayerDescription {
    return {
        summary,
        formulaDetails: [
            math.prayerModifierFormula(),
            ...formulaDetails,
            math.prayerAnswerFormula('pray'),
        ],
        examples,
        notes: [
            '100% относится к применению модификатора. Сам дар молитвы по-прежнему требует ответа божества; его вероятность этот модификатор не увеличивает.',
            faithAndPower,
        ],
    }
}
function radiusChance(id: string): PrayerDescription {
    const cells = id === 'prayer.radius2' ? 2 : 1
    return deterministic(
        'Радиус увеличивается постоянно; дополнительного броска нет.',
        [math.prayerRadiusFormula()],
        [
            {
                label: 'Пример: ширина клетки 16 px',
                value: `${cells} изученных увеличения: R = ${48 + cells * 16} px; применение 100%.`,
            },
        ]
    )
}
function focusChance(): PrayerDescription {
    const description = deterministic(
        'Сосредоточение всегда сокращает канал молитвы на 10%.',
        [math.prayerFocusFormula()],
        [{ label: 'Со Сосредоточением', value: 'T = 2700 мс; применение 100%.' }]
    )
    description.notes.push('Следующая попытка доступна сразу после окончания канала.')
    return description
}
function giftChance(id: string): PrayerDescription {
    const lastLight = id === 'prayer.last_light'
    const result = deterministic(
        lastLight
            ? 'Последний огонёк даёт условный гарантированный бонус силы; успех самого лечения остаётся вероятностным.'
            : 'Изученный дар гарантированно усиливает успешное обычное лечение; шанс ответа сохраняется.',
        [
            math.prayerHealingMultiplierFormula(),
            math.prayerRestorationFormula('pray'),
            ...(lastLight ? [math.prayerLowHpFormula()] : []),
        ],
        [
            {
                label: 'Тёплый дар / оба дара',
                value: 'Множитель: 1,05 / 1,10; с обоими дарами и активным Последним огоньком — 1,20.',
            },
            ...(lastLight
                ? [
                      {
                          label: 'Нейтральное настроение, Тёплый дар и активный Последний огонёк',
                          value: 'Сила: round(6 × 1,15) = 7 HP; шанс лечения остаётся 55%.',
                      },
                  ]
                : []),
        ]
    )
    result.notes.push(
        'Бонус усиливает обычное лечение HP. Воскрешение сохраняет стандартную половину ресурсов; новые открытия этой молитвы не меняют уже рассчитанный дар.'
    )
    if (lastLight)
        result.notes.push(
            'Порог здоровья, происхождение ран и условия бонуса проверяются до исцеления.'
        )
    return result
}
function harmChance(id: string): PrayerDescription {
    return {
        summary:
            id === 'prayer.harm'
                ? 'Кара срабатывает по более высокому порогу, чем лечебный ответ.'
                : 'Множитель урона кары применяется со 100% вероятностью, если сама кара сработала.',
        formulaDetails: [
            ...(id === 'prayer.harm' ? [] : [math.prayerModifierFormula()]),
            math.prayerAnswerFormula('pray'),
            math.prayerHarmFormula(),
            math.prayerHarmRollFormula(),
            math.prayerHarmPowerFormula(),
            math.prayerHarmMultiplierFormula(),
        ],
        examples: prayerChanceExamples(prayerSchoolInfo.pray.masteryName, 'harm'),
        notes: [
            oneRoll,
            'Кара может сработать при отказе лечебного дара: её порог выше порога ответа. Все подходящие цели — нежить в радиусе и прямой видимости; сторона цели не меняет порог.',
            'Кара доступна после открытия звезды. Её базовая сила равна 6 и усиливается настроением и изученными звёздами.',
            'Суровый ответ даёт множитель 1,30; вместе с Гневом небес — 1,60. Множители не повышают шанс кары; барьер может поглотить рассчитанный урон.',
        ],
    }
}
function areaChance(): PrayerDescription {
    return {
        summary:
            'Общая молитва всегда расширяет выбор целей; ответ и шаги очищения остаются вероятностными.',
        formulaDetails: [
            chanceFormula('Выбор всех подходящих союзников и могил в радиусе, %', '100'),
            math.prayerAnswerFormula('pray'),
            math.prayerAnswerRollFormula(),
            math.prayerPurificationFormula(),
            math.prayerPurificationRollFormula(),
            chanceFormula('Успешных шагов до очищения', String(GRAVE_PURIFY_STEPS)),
        ],
        examples: prayerChanceExamples(prayerSchoolInfo.pray.masteryName, 'grave'),
        notes: [
            oneRoll,
            `Очищение требует ${GRAVE_PURIFY_STEPS} накопленных успешных шагов, не обязательно подряд. У каждого союзника лечение ограничено его нехваткой HP.`,
            'Воскрешение сохраняет одну выбранную цель; кара и без Общей молитвы проверяет всю подходящую нежить в радиусе.',
        ],
    }
}
function insightChance(id: string): PrayerDescription {
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
        formulaDetails: [
            math.prayerInsightFormula(),
            ...(rank === 3 ? [math.prayerAnswerFormula(others ? undefined : 'pray')] : []),
            ...(rank === 4 ? [math.prayerMoodTimerFormula()] : []),
        ],
        examples:
            rank === 3
                ? prayerChanceExamples(prayerSchoolInfo.pray.masteryName).map((example) => ({
                      ...example,
                      label: others ? `Пантеон · ${example.label}` : example.label,
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
                ? ['Для каждого другого бога вероятность определяется его собственным настроением.']
                : []),
        ],
    }
}
