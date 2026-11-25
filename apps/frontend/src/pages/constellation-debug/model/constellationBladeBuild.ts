import {
    type BladeAbilityId,
    HUMAN_MELEE_RULES,
    resolveBladeDefense,
    resolveBladeTechnique,
} from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from '../../../../../backend/src/game/constellationBonuses'
import type { ConstellationBuildSummary } from './constellationBuildSummary'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const number = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value)
const row = (label: string, value: string | number) => ({ label, value: String(value) })

/** E is paid and rounded once by the ordinary strike; the shared resolver applies the technique once. */
export function describeBladeActionBuild(
    id: BladeAbilityId,
    b: Bonuses
): ConstellationBuildSummary {
    const energy = Math.ceil(HUMAN_MELEE_RULES.energy * b.swordEnergyMultiplier)
    const action = resolveBladeTechnique(id, b, energy, 1)
    if (id === 'defensive_stance') return guardBuild(b)
    return {
        rows: [
            row('Эффективная цена обычного удара, EN', energy),
            row('Цена приёма, EN', action.energy),
            row('Полный цикл приёма, мс', action.cycleMs),
            row('Момент попадания, мс', action.windupMs),
            row('Возвращение движения, мс', action.movementMs),
            row('Отдельный откат, мс', action.cooldownMs),
            row(
                'Урон от исходного оружейного',
                `×${number(b.swordDamageMultiplier * action.damageMultiplier)}`
            ),
            row('Радиус попадания, R', number(action.radius)),
            ...(action.angleDegrees === undefined
                ? []
                : [row('Угол сектора', `${action.angleDegrees}°`)]),
            ...(action.lungeDistance === undefined
                ? []
                : [row('Продвижение за 180 мс, R', number(action.lungeDistance))]),
            ...(action.stunMs === undefined
                ? []
                : [row('Оглушение до сопротивления, мс', action.stunMs)]),
            row('Потеря энергии цели, EN', action.targetEnergyDrain),
        ],
        effects: [
            'R — максимальная радиальная досягаемость серверной геометрии обычного удара.',
            'Урон округляется после усилений, крита и защиты цели; препятствия и допустимость цели проверяются сервером.',
            ...(action.movementFraction === undefined
                ? []
                : [
                      `С момента попадания до ${action.movementMs} мс доступно движение на ${action.movementFraction * 100}% обычной скорости.`,
                  ]),
        ],
    }
}

function guardBuild(b: Bonuses): ConstellationBuildSummary {
    const defense = resolveBladeDefense(b)
    const percent = (value: number) => `${number(value * 100)}%`
    return {
        rows: [
            row('Снижение ближнего физического урона', percent(defense.meleeReduction)),
            row('Снижение дальнего физического урона', percent(defense.rangedReduction)),
            row('Парирование ближнего удара', percent(defense.meleeParryChance)),
            row('Парирование дальнего удара', percent(defense.rangedParryChance)),
            row('Минимум энергии и цена принятого удара, EN', defense.hitEnergy),
            row('Цена парирования, EN', defense.parryEnergy),
            row('Повторный вход после выхода, мс', defense.reentryMs),
        ],
        effects: [
            'Движение, атаки, колдовство и восстановление энергии недоступны. Магия не ослабляется. Уклонение и Контрудар отключены.',
        ],
    }
}
