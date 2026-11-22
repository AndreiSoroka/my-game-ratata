import type { ArrowAbilityId } from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { resolveArrowParameters } from '../../../../backend/src/game/effectiveArrowParameters'
import type {
    ConstellationBuildOptions,
    ConstellationBuildSummary,
} from './constellationBuildSummary'
import { constellationDistance } from './constellationDistance'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
type Parameters = ReturnType<typeof resolveArrowParameters>
const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 })
const multiplier = (value: number) => `×${format.format(value)}`
const bonusPercent = (value: number) => `+${format.format(value * 100)}%`
const bonusPoints = (value: number) => `+${format.format(value * 100)} п.п.`
const row = (label: string, value: string | number) => ({ label, value: String(value) })

export function describeArrowActionBuild(
    ability: ArrowAbilityId,
    active: ReadonlySet<string>,
    bonuses: Bonuses,
    options: ConstellationBuildOptions
): ConstellationBuildSummary {
    const parameters = resolveArrowParameters(ability, bonuses, options.tileWidth)
    const distance = constellationDistance(parameters.range, 0, options.tileWidth)
    return ability === 'shot'
        ? quickShot(active, bonuses, parameters, distance, options.runicCharged === true)
        : sniperShot(active, bonuses, parameters, distance)
}

function quickShot(
    active: ReadonlySet<string>,
    bonuses: Bonuses,
    parameters: Parameters,
    distance: string,
    charged: boolean
): ConstellationBuildSummary {
    const echo = active.has('magic.runic_echo')
    const runicMultiplier = echo && charged ? 1.1 : 1
    return {
        rows: [
            row('Урон Быстрого выстрела от звёзд Стрелы', multiplier(bonuses.shotDamageMultiplier)),
            ...(echo
                ? [row('Руническое эхо', charged ? 'заряд активен, ×1,10' : 'без заряда, ×1')]
                : []),
            row(
                'Итоговый множитель урона Быстрого выстрела',
                multiplier(bonuses.shotDamageMultiplier * runicMultiplier)
            ),
            row('Дальность Быстрого выстрела', distance),
            row('Цена Быстрого выстрела, EN', parameters.energy),
            row('Кулдаун Быстрого выстрела, мс', parameters.cooldownMs),
            row('Бонус критического шанса Быстрого выстрела', bonusPoints(bonuses.shotCritBonus)),
            row('Остановка при ходьбе, мс', parameters.movementMs),
            row('Знание обоих выстрелов', shotKnowledge(active)),
            ...quickShotConditions(bonuses),
        ],
        effects: echo
            ? [
                  'Рунический заряд действует менее 5 секунд и расходуется при начале оплаченного Быстрого выстрела.',
              ]
            : [],
    }
}

function quickShotConditions(bonuses: Bonuses): ConstellationBuildSummary['rows'] {
    return [
        ...(bonuses.shotSeriesDamage > 0
            ? [row('Урон в серии Быстрых выстрелов', bonusPercent(bonuses.shotSeriesDamage))]
            : []),
        ...(bonuses.movingShotDamage > 0
            ? [row('Урон на ходу', bonusPercent(bonuses.movingShotDamage))]
            : []),
        ...(bonuses.movingShotCritBonus > 0
            ? [row('Бонус крита на ходу', bonusPoints(bonuses.movingShotCritBonus))]
            : []),
        ...(bonuses.movingShotDashReductionMs > 0
            ? [
                  row(
                      'Сокращение отката рывка после попадания, мс',
                      bonuses.movingShotDashReductionMs
                  ),
              ]
            : []),
        ...(bonuses.movingShotSpeedBonus > 0
            ? [row('Скорость шага после попадания', bonusPercent(bonuses.movingShotSpeedBonus))]
            : []),
        ...(bonuses.movingShotFollowupDamage > 0
            ? [row('Урон при Смене позиции', bonusPercent(bonuses.movingShotFollowupDamage))]
            : []),
    ]
}

function sniperShot(
    active: ReadonlySet<string>,
    bonuses: Bonuses,
    parameters: Parameters,
    distance: string
): ConstellationBuildSummary {
    return {
        rows: [
            row(
                'Базовый урон Снайперского выстрела, HP',
                `${parameters.damage}–${parameters.maxDamage}`
            ),
            row('Дальность Снайперского выстрела', distance),
            row('Цена Снайперского выстрела, EN', parameters.energy),
            row('Прицеливание, мс', parameters.windupMs),
            row('Боевой откат Снайперского выстрела, мс', parameters.cycleMs),
            row('Бонус крита Снайперского выстрела', bonusPoints(bonuses.sniperCritBonus)),
            row('Знание обоих выстрелов', shotKnowledge(active)),
            ...(bonuses.sniperOpeningDamage > 0
                ? [row('Урон при Первом натяге', bonusPercent(bonuses.sniperOpeningDamage))]
                : []),
            ...(bonuses.sniperLongRangeDamage > 0
                ? [row('Урон с 8 клеток и дальше', bonusPercent(bonuses.sniperLongRangeDamage))]
                : []),
        ],
        effects: ['Ходьба прерывает прицеливание. После выпуска движение сразу доступно.'],
    }
}

function shotKnowledge(active: ReadonlySet<string>): string {
    if (active.has('arrow.insight2')) return 'точные урон, интервал и крит'
    return active.has('arrow.insight1')
        ? 'урон: шаг 2; интервал: 100 мс; крит: 2 п.п.'
        : 'урон: шаг 5; интервал: 500 мс; крит: 5 п.п.'
}
