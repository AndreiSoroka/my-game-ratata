import type { ArrowAbilityId } from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'
import { fullConstellationCatalog } from './constellationNodes'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
interface Context {
    learned: ReadonlySet<string>
    bonuses: Bonuses
}
const nodes = new Map(
    fullConstellationCatalog
        .filter((node) => node.constellationId === 'arrow')
        .map((node) => [node.id, node])
)
const percent = (value: number) => String(Math.round(value * 100))
const cells = (value: number) =>
    `${String(value)} ${value === 1 ? 'клетку' : 'клетки'}`

export function arrowCardEffects(
    ability: ArrowAbilityId,
    bonuses: Bonuses,
    learned: ReadonlySet<string>
): string[] {
    const effects: string[] = []
    if (ability === 'shot') {
        appendShot(effects, { learned, bonuses })
    } else {
        appendSniperShot(effects, { learned, bonuses })
    }
    appendArrowKnowledge(effects, learned)
    return effects
}

function appendShot(effects: string[], { learned, bonuses: b }: Context): void {
    if (b.shotDamageMultiplier > 1) {
        effects.push(
            `Урон Быстрого выстрела увеличен на ${percent(b.shotDamageMultiplier - 1)}%.`
        )
    }
    if (b.shotRangeCells > 0) {
        effects.push(
            `Дальность Быстрого выстрела увеличена на ${cells(b.shotRangeCells)}.`
        )
    }
    if (b.shotEnergyDiscount > 0) {
        effects.push(
            `Быстрый выстрел расходует на ${String(b.shotEnergyDiscount)} EN меньше.`
        )
    }
    if (b.shotTempoMultiplier < 1) {
        effects.push(
            `Интервал между Быстрыми выстрелами сокращён на ${percent(1 - b.shotTempoMultiplier)}%.`
        )
    }
    if (b.shotCritBonus > 0) {
        effects.push(
            `Критический шанс Быстрого выстрела увеличен на ${percent(b.shotCritBonus)} п. п.`
        )
    }
    if (b.shotSeriesDamage > 0) {
        effects.push(
            `После полезного попадания следующий Быстрый выстрел по той же цели в течение секунды наносит на ${percent(b.shotSeriesDamage)}% больше урона.`
        )
    }
    appendMovingShot(effects, b)
    if (learned.has('magic.runic_echo')) {
        effects.push(
            'После полезного боевого заклинания следующий Быстрый выстрел на 10% сильнее в течение 5 секунд.'
        )
    }
}
function appendMovingShot(effects: string[], b: Bonuses): void {
    if (b.shotWhileMoving) {
        effects.push('Быстрый выстрел больше не останавливает обычную ходьбу.')
    }
    if (b.movingShotDamage > 0) {
        effects.push(
            `Урон Быстрого выстрела на ходу увеличен на ${percent(b.movingShotDamage)}%.`
        )
    }
    if (b.movingShotCritBonus > 0) {
        effects.push(
            `Критический шанс Быстрого выстрела на ходу увеличен на ${percent(b.movingShotCritBonus)} п. п.`
        )
    }
    if (b.movingShotDashReductionMs > 0) {
        effects.push(
            `Полезное попадание на ходу сокращает оставшийся откат рывка на ${String(b.movingShotDashReductionMs)} мс.`
        )
    }
    if (b.movingShotSpeedBonus > 0) {
        effects.push(
            `Полезное попадание на ходу ускоряет обычный шаг на ${percent(b.movingShotSpeedBonus)}% на 600 мс.`
        )
    }
    if (b.movingShotFollowupDamage > 0) {
        effects.push(
            `После полезного Снайперского попадания следующий Быстрый выстрел на ходу по той же цели в течение четырёх секунд наносит на ${percent(b.movingShotFollowupDamage)}% больше урона.`
        )
    }
}
function appendSniperShot(
    effects: string[],
    { learned, bonuses: b }: Context
): void {
    effects.push(
        'Во время прицеливания стрелок стоит. Ходьба прерывает выстрел.'
    )
    if (b.sniperRangeCells > 0) {
        effects.push(
            `Дальность Снайперского выстрела увеличена на ${cells(b.sniperRangeCells)}.`
        )
    }
    if (b.sniperEnergyDiscount > 0) {
        effects.push(
            `Снайперский выстрел расходует на ${String(b.sniperEnergyDiscount)} EN меньше.`
        )
    }
    if (b.sniperWindupReductionMs > 0) {
        effects.push(
            `Прицеливание Снайперского выстрела короче на ${String(b.sniperWindupReductionMs)} мс.`
        )
    }
    if (b.sniperCooldownReductionMs > 0) {
        effects.push(
            `Откат Снайперского выстрела короче на ${String(b.sniperCooldownReductionMs)} мс.`
        )
    }
    if (b.sniperCritBonus > 0) {
        effects.push(
            `Критический шанс Снайперского выстрела увеличен на ${percent(b.sniperCritBonus)} п. п.`
        )
    }
    appendDescription(effects, learned, 'arrow.sniper_opening')
    appendDescription(effects, learned, 'arrow.sniper_long_range')
}
function appendArrowKnowledge(
    effects: string[],
    learned: ReadonlySet<string>
): void {
    appendDescription(
        effects,
        learned,
        learned.has('arrow.insight2') ? 'arrow.insight2' : 'arrow.insight1'
    )
}
function appendDescription(
    effects: string[],
    learned: ReadonlySet<string>,
    id: string
): void {
    const node = nodes.get(id)
    if (learned.has(id) && node !== undefined) {
        effects.push(...(node.results ?? [node.description]))
    }
}
