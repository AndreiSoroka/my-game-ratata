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
import { describeRevivalChance, rootRevivalChance } from './constellationRevivalChance'

interface PrayerDescription extends Omit<ConstellationEffectChance, 'formulas' | 'formulaDetails'> {
    formulaDetails: ConstellationChanceFormula[]
}
const oneRoll =
    'На завершённую молитву берётся один случайный бросок от 0 включительно до 1 не включительно. Он общий для лечения, кары и шагов очищения, а также для всех подходящих целей; отдельных бросков по целям нет.'
const faithAndPower =
    'Мастерство определяет открытия звёзд. Вероятность и базовая сила зависят от настроения божества; изученные звёзды добавляют усиления.'
const moodBase = '80 при благосклонности; 55 при нейтральном настроении; 25 при гневе.'

/** Static debug formulas only: settings for the example calculator live in a separate pure API. */
export function describePrayerEffectChance(
    node: ConstellationStar,
    activeIds?: ReadonlySet<string>
): ConstellationEffectChance | undefined {
    const ability = prayerAbilityForConstellation(node.constellationId)
    if (ability === undefined) return undefined
    const description =
        node.kind === 'root'
            ? rootChance(ability, activeIds)
            : describePrayer(node, ability, activeIds)
    if (description === undefined) return undefined
    const { formulaDetails, ...text } = description
    return withChanceFormulas(text, formulaDetails)
}
function describePrayer(
    node: ConstellationStar,
    ability: PrayerAbilityId,
    activeIds?: ReadonlySet<string>
): PrayerDescription | undefined {
    if (node.kind === 'root') return rootChance(ability)
    const revival = describeRevivalChance(node.id, ability)
    if (revival) return revival
    if (node.id.startsWith('prayer.harm')) return harmChance(node.id)
    if (['prayer.gift1', 'prayer.gift2', 'prayer.last_light'].includes(node.id))
        return giftChance(node.id)
    if (node.id.startsWith('prayer.radius')) return radiusChance(node.id)
    if (node.id === 'prayer.focus') return focusChance()
    if (node.id === 'prayer.area') return rootChance('pray', activeIds)
    if (node.id === 'prayer.concentration')
        return {
            summary: node.description,
            formulaDetails: [chanceFormula('Защита от прерывания ударом, %', '50')],
            examples: [],
            notes: [
                'Каждый удар проверяется отдельно. Абсолютная концентрация отменяет эту проверку.',
            ],
        }
    const extension = extensionChance(node)
    if (extension) return extension
    if (node.id.startsWith('prayer.omen') || node.id.startsWith('prayer.others'))
        return insightChance(node.id)
    return undefined
}
function extensionChance(node: ConstellationStar): PrayerDescription | undefined {
    if (
        (node.constellationId === 'prayer' &&
            ['prayer.absolute_concentration', 'prayer.hasty_harm', 'prayer.martyr'].includes(
                node.id
            )) ||
        /^prayer\.(targets|ward|aura_)/.test(node.id)
    )
        return {
            deterministic: true,
            summary: node.description,
            formulaDetails: [],
            examples: [],
            notes: [],
        }
    return undefined
}
function rootChance(ability: PrayerAbilityId, activeIds?: ReadonlySet<string>): PrayerDescription {
    const info = prayerSchoolInfo[ability]
    const definition = PRAYER_SCHOOL_DEFINITIONS[ability]
    const revival = revivalForRoot(ability, activeIds)
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
                      math.prayerPurificationRollFormula(),
                      chanceFormula('Успешных шагов до очищения', String(GRAVE_PURIFY_STEPS)),
                  ]
                : []),
            ...(revival?.formulaDetails ?? []),
        ],
        examples: [
            ...prayerChanceExamples(info.masteryName, ability === 'pray' ? 'grave' : 'answer'),
            ...(revival?.examples ?? []),
        ],
        notes: [
            `Используется настроение только своего бога (${definition.deityId}). Выбор покровителя в HUD эту привязку не меняет.`,
            faithAndPower,
            oneRoll,
            ...(ability === 'pray'
                ? [
                      'Пять шагов очищения не обязаны идти подряд; отказ сохраняет уже набранный прогресс. Каждый удачный бросок добавляет один шаг каждой подходящей могиле.',
                  ]
                : [
                      'Модификаторы созвездия «Молитва», включая Кару и Сплетённую молитву, эту школу не усиливают.',
                  ]),
            'Если бросок не прошёл порог ответа, дар не срабатывает. Вероятности относятся к завершённой допустимой молитве; отмена не делает бросок.',
        ],
    }
}
function revivalForRoot(ability: PrayerAbilityId, activeIds?: ReadonlySet<string>) {
    if (!activeIds) return undefined
    const id =
        ability === 'pray'
            ? 'prayer.revive'
            : ability === 'pray_grave'
              ? 'prayer_grave.revive'
              : undefined
    return id && activeIds.has(id) ? rootRevivalChance(ability, activeIds) : undefined
}
function deterministic(
    summary: string,
    formulaDetails: ConstellationChanceFormula[],
    examples: ConstellationEffectChance['examples'] = []
): PrayerDescription {
    return {
        deterministic: true,
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
                value: 'Множитель: 2,30 / 4,80; с обоими дарами и активным Последним огоньком — 14,80.',
            },
            ...(lastLight
                ? [
                      {
                          label: 'Нейтральное настроение, Тёплый дар и активный Последний огонёк',
                          value: 'Сила: round(6 × 12,30) = 74 HP; шанс лечения остаётся 55%.',
                      },
                  ]
                : []),
        ]
    )
    result.notes.push(
        'Бонус усиливает обычное лечение HP. Ресурсы воскрешения считаются отдельно; новые открытия этой молитвы не меняют уже рассчитанный дар.'
    )
    if (lastLight)
        result.notes.push(
            'Порог здоровья, происхождение ран и условия бонуса проверяются до исцеления.'
        )
    return result
}
function harmChance(id: string): PrayerDescription {
    return {
        ...(id === 'prayer.harm' ? {} : { deterministic: true }),
        summary:
            id === 'prayer.harm'
                ? 'Кара срабатывает по более высокому порогу, чем лечебный ответ.'
                : 'Множитель урона кары применяется со 100% вероятностью, если сама кара сработала.',
        formulaDetails: [
            ...(id === 'prayer.harm' ? [] : [math.prayerModifierFormula()]),
            chanceFormula('Шанс кары, %', 'min(95, B + 20)', { B: moodBase }),
            math.prayerHarmRollFormula(),
            ...(id === 'prayer.harm'
                ? [
                      chanceFormula('Собственный урон кары до поглощения', 'round(6 × Q)', {
                          Q: 'Качество настроения: 1,3 при благосклонности; 1 при нейтральном; 0,65 при гневе.',
                      }),
                  ]
                : [math.prayerHarmPowerFormula(), math.prayerHarmMultiplierFormula()]),
        ],
        examples: prayerChanceExamples(prayerSchoolInfo.pray.masteryName, 'harm'),
        notes: [
            'Один случайный бросок общий для всей подходящей нежити в радиусе молитвы.',
            'Кара может сработать при отказе лечебного дара: её порог выше порога ответа. Все подходящие цели — нежить в радиусе и прямой видимости; сторона цели не меняет порог.',
            'Собственный эффект Кары имеет базовую силу 6, зависит от настроения божества и может поглощаться Барьером. Полный результат с усилениями показан у Молитвы.',
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
        deterministic: true,
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
