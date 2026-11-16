import {
    HERO_REVIVAL_WINDOW_MS,
    prayerManaCost,
    resolveResurrectionParameters,
    REVIVE_CAST_MS,
} from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { prayerMoodQuality } from '../../../../backend/src/game/prayerProbability'
import { chancePercent, successWithAdvantage } from './constellationChanceMath'
import type { PrayerBuildContext, PrayerBuildResult } from './constellationPrayerBuild'

const number = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
const row = (label: string, value: string) => ({ label, value })

/** A passive owns its contribution, never the accumulated result of its parents or siblings. */
export function describePrayerPassive(
    nodeId: string,
    context: PrayerBuildContext
): Omit<PrayerBuildResult, 'available'> {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (!node || node.effectType !== 'passive') throw new Error(`Not a prayer passive: ${nodeId}`)
    const bonus = resolveConstellationBonuses(new Set([nodeId]), true)
    const metrics =
        advancedPassiveMetrics(nodeId, context) ?? passiveMetrics(nodeId, context, bonus)
    if (metrics) return { effects: [], metrics }
    if (nodeId === 'prayer.harm')
        return {
            effects: ['Наносит урон подходящей нежити в радиусе молитвы.'],
            metrics: [
                row(
                    'Урон кары',
                    `${Math.round(6 * prayerMoodQuality[context.mood])} HP до поглощения`
                ),
            ],
        }
    if (nodeId.endsWith('.revive'))
        return {
            effects: [node.description],
            metrics: [
                row('Цели воскрешения', 'Одна выбранная павшая цель'),
                row('Окно души', `${HERO_REVIVAL_WINDOW_MS / 1000} с`),
                row('Время воскрешения', `${REVIVE_CAST_MS} мс`),
                row('Цена воскрешения', `${prayerManaCost('revive', context.ability)} MP`),
                row('Ресурсы после воскрешения', baseRevivalResources(context)),
            ],
        }
    return { effects: [node.description], metrics: [] }
}
function advancedPassiveMetrics(
    id: string,
    context: PrayerBuildContext
): PrayerBuildResult['metrics'] | undefined {
    if (id === 'prayer.concentration')
        return [
            row('Время молитвы', '−20%'),
            row(
                'Защита от прерывания ударом',
                chancePercent(successWithAdvantage(0.5, context.externalAdvantage))
            ),
        ]
    if (id === 'prayer.absolute_concentration')
        return [row('Время молитвы', '−10%'), row('Защита от прерывания ударом', '100%')]
    if (id === 'prayer.hasty_harm')
        return [row('Время молитвы', '−5%'), row('Усиление урона Кары', '−100 п.п.')]
    if (id.startsWith('prayer.targets'))
        return [row('Дополнительные цели обеих молитв', `+${[1, 3, 15][Number(id.at(-1)) - 1]}`)]
    if (id === 'prayer.aura_protection')
        return [
            row('Уклонение всех живых в радиусе', '+10 п.п.'),
            row('Аура', context.aurasSuppressed ? 'Подавлена' : 'Действует, включая врагов'),
        ]
    if (id === 'prayer.aura_blessing')
        return [
            row('Успех других участников группы', 'Преимущество: два броска, лучший результат'),
            row('Собственные проверки', 'Без преимущества от своей ауры'),
            row('Аура', context.aurasSuppressed ? 'Подавлена' : 'Действует'),
        ]
    if (id === 'prayer.aura_domain')
        return [
            row('Лечение всех живых', '5 × 1 HP: на 100, 200, 300, 400 и 500 мс'),
            row('Входящий урон нежити', '+50% от любых атакующих'),
            row('Аура', context.aurasSuppressed ? 'Подавлена' : 'Действует, включая врагов'),
        ]
    if (id === 'prayer.martyr')
        return [
            row('Базовое максимальное HP', '−30%'),
            row('Базовая максимальная MP', '−15%'),
            row('Время молитвы', '−15%'),
            row('Лечение', '+15%'),
        ]
    return undefined
}
function passiveMetrics(
    id: string,
    context: PrayerBuildContext,
    bonus: ReturnType<typeof resolveConstellationBonuses>
): PrayerBuildResult['metrics'] | undefined {
    if (nodeRevivalMetrics[id]) return nodeRevivalMetrics[id]!.map((metric) => ({ ...metric }))
    if (['prayer.radius1', 'prayer.radius2'].includes(id))
        return [row('Радиус молитвы', `+${bonus.prayerRadiusCells} клетка`)]
    if (id === 'prayer.focus')
        return [row('Время молитвы', `−${number((1 - bonus.prayerDurationMultiplier) * 100)}%`)]
    if (['prayer.gift1', 'prayer.gift2', 'prayer.last_light'].includes(id)) {
        const metrics = [row('Лечение', `+${number((bonus.prayerGiftMultiplier - 1) * 100)}%`)]
        if (id === 'prayer.last_light')
            metrics.push(
                row('Время молитвы', '−20%'),
                row('Цена каждого лечения', '30% максимальной MP'),
                row('Первая цель', 'Всегда вы'),
                row('Защита от прерывания', 'Только смерть прерывает молитву'),
                row('Откат', '10 с'),
                row('Условие', context.lowHealthEligible ? 'Выполнено' : 'Не выполнено')
            )
        return metrics
    }
    if (['prayer.harm1', 'prayer.harm2'].includes(id))
        return [row('Урон кары', `+${number((bonus.prayerHarmMultiplier - 1) * 100)}%`)]
    if (id === 'prayer.area')
        return [
            row('Цели лечения', 'Вы и все подходящие союзники в радиусе молитвы'),
            row('Цели очищения', 'Все подходящие могилы в радиусе молитвы'),
        ]
    if (id.startsWith('prayer.omen') || id.startsWith('prayer.others')) {
        const insight = [
            'Намёки на настроение',
            'Точное настроение',
            'Шанс ответа',
            'Время до смены настроения',
        ][Number(id.at(-1)) - 1]!
        return [row(id.startsWith('prayer.others') ? 'Другие боги' : 'Угольная Мать', insight)]
    }
    return undefined
}
const nodeRevivalMetrics: Record<string, PrayerBuildResult['metrics']> = {
    'prayer.revive_higher': [
        row('HP после воскрешения', '75% максимума; округление вверх, минимум 1'),
    ],
    'prayer.revive_experienced': [row('Бонус шанса воскрешения', '+10 п.п.')],
    'prayer.revive_master': [row('Бонус шанса воскрешения', '+10 п.п.')],
    'prayer.revive_angelic': [
        row(
            'Ресурсы при Ангельском воскрешении',
            '150% максимума HP, MP и EN; минимум 1 каждого ресурса'
        ),
    ],
    'prayer.revive_stable': [
        row('HP после воскрешения', 'Не менее 100% максимума'),
        row('Бонус шанса воскрешения', '+5 п.п.'),
    ],
}
function baseRevivalResources(context: PrayerBuildContext): string {
    const parameters = resolveResurrectionParameters(context.ability, new Set(), context.mood)
    return `${number(parameters.hpFraction * 100)}% максимума; HP округляется вверх; минимум 1${parameters.minimumResource > 0 ? ' каждого ресурса' : ' HP'}`
}
