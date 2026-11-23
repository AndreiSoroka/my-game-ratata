import type { ArrowAbilityId } from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'
import {
    appendLearnedEffect,
    type EffectRow,
    effectRow,
} from './constellationEffectText'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
interface Context {
    learned: ReadonlySet<string>
    bonuses: Bonuses
}
const percent = (value: number) => String(Math.round(value * 100))
const cells = (value: number) =>
    `${String(value)} ${value === 1 ? 'клетку' : 'клетки'}`

const tiles = (value: number) =>
    `${String(value)} ${value === 1 ? 'tile' : 'tiles'}`

export function arrowCardEffects(
    ability: ArrowAbilityId,
    bonuses: Bonuses,
    learned: ReadonlySet<string>
): EffectRow[] {
    const effects: EffectRow[] = []
    if (ability === 'shot') {
        appendShot(effects, { learned, bonuses })
    } else {
        appendSniperShot(effects, { learned, bonuses })
    }
    appendArrowKnowledge(effects, learned)
    return effects
}

function appendShot(
    effects: EffectRow[],
    { learned, bonuses: b }: Context
): void {
    if (b.shotDamageMultiplier > 1) {
        effects.push(
            effectRow(
                `Урон Быстрого выстрела увеличен на ${percent(b.shotDamageMultiplier - 1)}%.`,
                `Quick shot damage increases by ${percent(b.shotDamageMultiplier - 1)}%.`
            )
        )
    }
    if (b.shotRangeCells > 0) {
        effects.push(
            effectRow(
                `Дальность Быстрого выстрела увеличена на ${cells(b.shotRangeCells)}.`,
                `Quick shot range increases by ${tiles(b.shotRangeCells)}.`
            )
        )
    }
    if (b.shotEnergyDiscount > 0) {
        effects.push(
            effectRow(
                `Быстрый выстрел расходует на ${String(b.shotEnergyDiscount)} EN меньше.`,
                `Quick shot costs ${String(b.shotEnergyDiscount)} less EN.`
            )
        )
    }
    if (b.shotTempoMultiplier < 1) {
        effects.push(
            effectRow(
                `Интервал между Быстрыми выстрелами сокращён на ${percent(1 - b.shotTempoMultiplier)}%.`,
                `The interval between Quick shots is ${percent(1 - b.shotTempoMultiplier)}% shorter.`
            )
        )
    }
    if (b.shotCritBonus > 0) {
        effects.push(
            effectRow(
                `Критический шанс Быстрого выстрела увеличен на ${percent(b.shotCritBonus)} п. п.`,
                `Quick shot critical chance increases by ${percent(b.shotCritBonus)} percentage points.`
            )
        )
    }
    if (b.shotSeriesDamage > 0) {
        effects.push(
            effectRow(
                `После полезного попадания следующий Быстрый выстрел по той же цели в течение секунды наносит на ${percent(b.shotSeriesDamage)}% больше урона.`,
                `After a qualifying hit, the next Quick shot against the same target within one second deals ${percent(b.shotSeriesDamage)}% more damage.`
            )
        )
    }
    appendMovingShot(effects, b)
    if (learned.has('magic.runic_echo')) {
        effects.push(
            effectRow(
                'После полезного боевого заклинания следующий Быстрый выстрел на 10% сильнее в течение 5 секунд.',
                'After a qualifying combat spell, the next Quick shot within 5 seconds deals 10% more damage.'
            )
        )
    }
}
function appendMovingShot(effects: EffectRow[], b: Bonuses): void {
    if (b.shotWhileMoving) {
        effects.push(
            effectRow(
                'Быстрый выстрел больше не останавливает обычную ходьбу.',
                'Quick shot no longer interrupts walking.'
            )
        )
    }
    if (b.movingShotDamage > 0) {
        effects.push(
            effectRow(
                `Урон Быстрого выстрела на ходу увеличен на ${percent(b.movingShotDamage)}%.`,
                `Quick shot damage while moving increases by ${percent(b.movingShotDamage)}%.`
            )
        )
    }
    if (b.movingShotCritBonus > 0) {
        effects.push(
            effectRow(
                `Критический шанс Быстрого выстрела на ходу увеличен на ${percent(b.movingShotCritBonus)} п. п.`,
                `Quick shot critical chance while moving increases by ${percent(b.movingShotCritBonus)} percentage points.`
            )
        )
    }
    if (b.movingShotDashReductionMs > 0) {
        effects.push(
            effectRow(
                `Полезное попадание на ходу сокращает оставшийся откат рывка на ${String(b.movingShotDashReductionMs)} мс.`,
                `A qualifying hit while moving reduces the remaining dash cooldown by ${String(b.movingShotDashReductionMs)} ms.`
            )
        )
    }
    if (b.movingShotSpeedBonus > 0) {
        effects.push(
            effectRow(
                `Полезное попадание на ходу ускоряет обычный шаг на ${percent(b.movingShotSpeedBonus)}% на 600 мс.`,
                `A qualifying hit while moving increases walking speed by ${percent(b.movingShotSpeedBonus)}% for 600 ms.`
            )
        )
    }
    if (b.movingShotFollowupDamage > 0) {
        effects.push(
            effectRow(
                `После полезного Снайперского попадания следующий Быстрый выстрел на ходу по той же цели в течение четырёх секунд наносит на ${percent(b.movingShotFollowupDamage)}% больше урона.`,
                `After a qualifying Sniper shot hit, the next moving Quick shot against the same target within four seconds deals ${percent(b.movingShotFollowupDamage)}% more damage.`
            )
        )
    }
}
function appendSniperShot(
    effects: EffectRow[],
    { learned, bonuses: b }: Context
): void {
    effects.push(
        effectRow(
            'Во время прицеливания стрелок стоит. Ходьба прерывает выстрел.',
            'The archer stands still while aiming. Walking interrupts the shot.'
        )
    )
    if (b.sniperRangeCells > 0) {
        effects.push(
            effectRow(
                `Дальность Снайперского выстрела увеличена на ${cells(b.sniperRangeCells)}.`,
                `Sniper shot range increases by ${tiles(b.sniperRangeCells)}.`
            )
        )
    }
    if (b.sniperEnergyDiscount > 0) {
        effects.push(
            effectRow(
                `Снайперский выстрел расходует на ${String(b.sniperEnergyDiscount)} EN меньше.`,
                `Sniper shot costs ${String(b.sniperEnergyDiscount)} less EN.`
            )
        )
    }
    if (b.sniperWindupReductionMs > 0) {
        effects.push(
            effectRow(
                `Прицеливание Снайперского выстрела короче на ${String(b.sniperWindupReductionMs)} мс.`,
                `Sniper shot aim time is ${String(b.sniperWindupReductionMs)} ms shorter.`
            )
        )
    }
    if (b.sniperCooldownReductionMs > 0) {
        effects.push(
            effectRow(
                `Откат Снайперского выстрела короче на ${String(b.sniperCooldownReductionMs)} мс.`,
                `Sniper shot cooldown is ${String(b.sniperCooldownReductionMs)} ms shorter.`
            )
        )
    }
    if (b.sniperCritBonus > 0) {
        effects.push(
            effectRow(
                `Критический шанс Снайперского выстрела увеличен на ${percent(b.sniperCritBonus)} п. п.`,
                `Sniper shot critical chance increases by ${percent(b.sniperCritBonus)} percentage points.`
            )
        )
    }
    appendLearnedEffect(effects, learned, 'arrow.sniper_opening')
    appendLearnedEffect(effects, learned, 'arrow.sniper_long_range')
}
function appendArrowKnowledge(
    effects: EffectRow[],
    learned: ReadonlySet<string>
): void {
    appendLearnedEffect(
        effects,
        learned,
        learned.has('arrow.insight2') ? 'arrow.insight2' : 'arrow.insight1'
    )
}
