import {
    type BladeAbilityId,
    resolveBladeDefense,
    resolveBladeTechnique,
} from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'
import { type EffectRow, effectRow } from './constellationEffectText'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const russianFormat = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 3,
})
const englishFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })
const number = (value: number) => russianFormat.format(value)
const englishNumber = (value: number) => englishFormat.format(value)

/** R and E remain symbolic; phases and upgrades come from the same table as contact resolution. */
export function bladeTechniqueCardResults(
    ability: BladeAbilityId,
    bonuses: Bonuses
): EffectRow[] {
    const p = resolveBladeTechnique(ability, bonuses, 100, 1)
    if (ability === 'defensive_stance') {
        return defenseResults(bonuses)
    }
    const singleTargetSeries =
        ability === 'lunge' || ability === 'pommel_strike'
    return [
        effectRow(
            `Цикл ${String(p.cycleMs)} мс; попадание на ${String(p.windupMs)} мс; движение доступно с ${String(p.movementMs)} мс.`,
            `Cycle: ${String(p.cycleMs)} ms. Hit at ${String(p.windupMs)} ms. Movement resumes at ${String(p.movementMs)} ms.`
        ),
        effectRow(
            `Наносит ${number(p.damageMultiplier * 100)}% оружейного урона с постоянными усилениями Клинка${singleTargetSeries ? ' и серией' : ' каждой цели'}.`,
            `${singleTargetSeries ? 'Deals' : 'Each target takes'} ${englishNumber(p.damageMultiplier * 100)}% weapon damage with passive Blade bonuses${singleTargetSeries ? ' and combo bonuses' : ''}.`
        ),
        effectRow(
            `Цена — ${number(p.energy / 100)} эффективной стоимости обычного удара, округлённая вверх; откат ${number(p.cooldownMs / 1000)} секунд.`,
            `Costs ${englishNumber(p.energy / 100)} times the effective cost of a normal strike, rounded up. Cooldown: ${englishNumber(p.cooldownMs / 1000)} s.`
        ),
        ...geometryResults(ability, p),
        ...(p.stunMs === undefined
            ? []
            : [
                  effectRow(
                      `После урона здоровью гарантирует оглушение на ${String(p.stunMs)} мс до сопротивления цели; соблюдает общий иммунитет к оглушению.`,
                      `Dealing health damage guarantees a ${String(p.stunMs)} ms stun before target resistance. Stun immunity still applies.`
                  ),
              ]),
        ...(p.targetEnergyDrain === 20
            ? [
                  effectRow(
                      'Попадание снимает суммарно 20 энергии вместо стандартной потери.',
                      'A hit removes 20 energy in total instead of the usual amount.'
                  ),
              ]
            : []),
        ...(p.movementFraction === undefined
            ? []
            : [
                  effectRow(
                      `С момента попадания до ${String(p.movementMs)} мс можно двигаться на ${number(p.movementFraction * 100)}% обычной скорости.`,
                      `From the hit until ${String(p.movementMs)} ms, you can move at ${englishNumber(p.movementFraction * 100)}% of normal speed.`
                  ),
              ]),
    ]
}
function geometryResults(
    ability: BladeAbilityId,
    p: ReturnType<typeof resolveBladeTechnique>
): EffectRow[] {
    if (ability === 'wide_swing' || ability === 'circular_swing') {
        return [
            ability === 'wide_swing'
                ? effectRow(
                      `Сектор ${String(p.angleDegrees)}° с радиусом ${number(p.radius)} обычной досягаемости; стены преграждают удар.`,
                      `A ${String(p.angleDegrees)}° arc with a radius of ${englishNumber(p.radius)} times normal reach. Walls block the strike.`
                  )
                : effectRow(
                      `Полный круг с радиусом ${number(p.radius)} обычной досягаемости; стены преграждают удар.`,
                      `A full circle with a radius of ${englishNumber(p.radius)} times normal reach. Walls block the strike.`
                  ),
            effectRow(
                'Одна цель получает одно попадание; серия и пассивное оглушение не действуют.',
                'Each target takes one hit. Combo bonuses and passive stuns do not apply.'
            ),
        ]
    }
    return ability === 'lunge'
        ? [
              effectRow(
                  `За первые 180 мс продвигает до ${number(p.lungeDistance ?? 1)} обычной досягаемости, соблюдая столкновения; затем повторно проверяет попадание.`,
                  `Advances up to ${englishNumber(p.lungeDistance ?? 1)} times normal reach in the first 180 ms, stopping at obstacles, then checks for a hit again.`
              ),
          ]
        : [
              effectRow(
                  'Поражает одну цель в обычной досягаемости.',
                  'Hits one target within normal reach.'
              ),
          ]
}
function defenseResults(bonuses: Bonuses): EffectRow[] {
    const defense = resolveBladeDefense(bonuses)
    return [
        effectRow(
            `Ближний физический урон уменьшен на ${number(defense.meleeReduction * 100)}%, дальний физический — на ${number(defense.rangedReduction * 100)}%; магия не ослабляется.`,
            `Reduces melee physical damage by ${englishNumber(defense.meleeReduction * 100)}% and ranged physical damage by ${englishNumber(defense.rangedReduction * 100)}%. Magic damage is unaffected.`
        ),
        effectRow(
            `Итоговый шанс парирования ближнего удара — ${number(defense.meleeParryChance * 100)}%; уклонение и Контрудар отключены.`,
            `Final melee parry chance: ${englishNumber(defense.meleeParryChance * 100)}%. Dodging and Counterstrike are disabled.`
        ),
        effectRow(
            `Для физического контакта нужно ${String(defense.hitEnergy)} энергии; парирование стоит ${String(defense.parryEnergy)}, принятый удар — ${String(defense.hitEnergy)} вместо стандартной потери.`,
            `Handling a physical hit requires ${String(defense.hitEnergy)} energy. A parry costs ${String(defense.parryEnergy)} energy and taking a hit costs ${String(defense.hitEnergy)} instead of the usual amount.`
        ),
        effectRow(
            'Энергия не восстанавливается; при нехватке сил стойка снимается до защиты.',
            'Energy does not recover. If energy is too low, the stance drops before it can protect you.'
        ),
        effectRow(
            `После выхода повторный вход доступен через ${number(defense.reentryMs / 1000)} секунду.`,
            `You can re-enter the stance ${englishNumber(defense.reentryMs / 1000)} s after leaving it.`
        ),
        ...(defense.rangedParryChance > 0
            ? [
                  effectRow(
                      `Шанс парирования дальнего физического удара — ${number(defense.rangedParryChance * 100)}%.`,
                      `Ranged physical parry chance: ${englishNumber(defense.rangedParryChance * 100)}%.`
                  ),
              ]
            : []),
    ]
}
