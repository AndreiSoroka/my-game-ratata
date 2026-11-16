import {
    ABILITY_DEFINITIONS,
    prayerManaCost,
    prayerSchoolId,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import type { PrayerBuildContext, PrayerBuildResult } from './constellationPrayerBuild'

const percent = (fraction: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 })
        .format(fraction)
        .replace(/\s/g, '')
const row = (label: string, value: string) => ({ label, value })

export function revivalBuild(
    activeIds: ReadonlySet<string>,
    context: PrayerBuildContext
): Pick<PrayerBuildResult, 'effects' | 'metrics'> {
    const parameters = resolveResurrectionParameters(context.ability, activeIds, context.mood)
    const bonuses = resolveConstellationBonuses(activeIds, context.lowHealthEligible)
    const duration = Math.round(
        ABILITY_DEFINITIONS[context.ability].windupMs *
            (prayerSchoolId(context.ability) === 'pray' ? bonuses.prayerDurationMultiplier : 1)
    )
    const minimum = parameters.minimumResource > 0 ? '; минимум 1 каждого ресурса' : ''
    const metrics = [
        row('Цена воскрешения', `${prayerManaCost('revive', context.ability)} MP за цель`),
        row('Время воскрешения', `${duration} мс`),
        row(
            'HP после воскрешения',
            `${percent(parameters.hpFraction)} максимума; округление вверх, минимум 1`
        ),
        row(
            'MP и EN после воскрешения',
            `${percent(parameters.resourceFraction)} максимума${minimum}`
        ),
    ]
    const effects = [
        prayerSchoolId(context.ability) === 'pray'
            ? `Воскрешение: в пределах общего лимита ${String(bonuses.targetLimit)} целей.`
            : 'Воскрешение: одна подходящая павшая цель.',
    ]
    if (parameters.angelicChance > 0) {
        metrics.push(
            row(
                'Ресурсы при Ангельском воскрешении',
                '150% максимума HP, MP и EN; минимум 1 каждого ресурса'
            )
        )
        effects.push(
            'Ангельское воскрешение: избыток ресурсов сохраняется до получения урона или расходования.'
        )
    }
    return { effects, metrics }
}
