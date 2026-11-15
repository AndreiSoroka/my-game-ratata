import { HERO_REVIVAL_WINDOW_MS, REVIVE_CAST_MS, REVIVE_MANA_COST } from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { prayerMoodQuality } from '../../../../backend/src/game/prayerProbability'
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
    const metrics = passiveMetrics(nodeId, context, bonus)
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
                row('Цена воскрешения', `${REVIVE_MANA_COST} MP`),
                row('Ресурсы после воскрешения', '50% максимума; HP округляется вверх, минимум 1'),
            ],
        }
    throw new Error(`Missing prayer passive result: ${nodeId}`)
}
function passiveMetrics(
    id: string,
    context: PrayerBuildContext,
    bonus: ReturnType<typeof resolveConstellationBonuses>
): PrayerBuildResult['metrics'] | undefined {
    if (['prayer.radius1', 'prayer.radius2'].includes(id))
        return [row('Радиус молитвы', `+${bonus.prayerRadiusCells} клетка`)]
    if (id === 'prayer.focus')
        return [row('Время молитвы', `−${number((1 - bonus.prayerDurationMultiplier) * 100)}%`)]
    if (['prayer.gift1', 'prayer.gift2', 'prayer.last_light'].includes(id)) {
        const metrics = [row('Лечение', `+${number((bonus.prayerGiftMultiplier - 1) * 100)}%`)]
        if (id === 'prayer.last_light')
            metrics.push(row('Условие', context.lowHealthEligible ? 'Выполнено' : 'Не выполнено'))
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
