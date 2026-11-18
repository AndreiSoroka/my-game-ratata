import {
    type BladeAbilityId,
    resolveBladeDefense,
    resolveBladeTechnique,
} from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const number = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value)

/** R and E remain symbolic; phases and upgrades come from the same table as contact resolution. */
export function bladeTechniqueCardResults(
    ability: BladeAbilityId,
    bonuses: Bonuses
): string[] {
    const p = resolveBladeTechnique(ability, bonuses, 100, 1)
    if (ability === 'defensive_stance') {
        return defenseResults(bonuses)
    }
    return [
        `Цикл ${String(p.cycleMs)} мс; попадание на ${String(p.windupMs)} мс; движение доступно с ${String(p.movementMs)} мс.`,
        `Наносит ${number(p.damageMultiplier * 100)}% оружейного урона с постоянными усилениями Клинка${ability === 'lunge' || ability === 'pommel_strike' ? ' и серией' : ' каждой цели'}.`,
        `Цена — ${number(p.energy / 100)} эффективной стоимости обычного удара, округлённая вверх; откат ${number(p.cooldownMs / 1000)} секунд.`,
        ...geometryResults(ability, p),
        ...(p.stunMs === undefined
            ? []
            : [
                  `После урона здоровью гарантирует оглушение на ${String(p.stunMs)} мс до сопротивления цели; соблюдает общий иммунитет к оглушению.`,
              ]),
        ...(p.targetEnergyDrain === 20
            ? [
                  'Попадание снимает суммарно 20 энергии вместо стандартной потери.',
              ]
            : []),
        ...(p.movementFraction === undefined
            ? []
            : [
                  `С момента попадания до ${String(p.movementMs)} мс можно двигаться на ${number(p.movementFraction * 100)}% обычной скорости.`,
              ]),
    ]
}
function geometryResults(
    ability: BladeAbilityId,
    p: ReturnType<typeof resolveBladeTechnique>
): string[] {
    if (ability === 'wide_swing' || ability === 'circular_swing') {
        return [
            ability === 'wide_swing'
                ? `Сектор ${String(p.angleDegrees)}° с радиусом ${number(p.radius)} обычной досягаемости; стены преграждают удар.`
                : `Полный круг с радиусом ${number(p.radius)} обычной досягаемости; стены преграждают удар.`,
            'Одна цель получает одно попадание; серия и пассивное оглушение не действуют.',
        ]
    }
    return ability === 'lunge'
        ? [
              `За первые 180 мс продвигает до ${number(p.lungeDistance ?? 1)} обычной досягаемости, соблюдая столкновения; затем повторно проверяет попадание.`,
          ]
        : ['Поражает одну цель в обычной досягаемости.']
}
function defenseResults(bonuses: Bonuses): string[] {
    const defense = resolveBladeDefense(bonuses)
    return [
        `Ближний физический урон уменьшен на ${number(defense.meleeReduction * 100)}%, дальний физический — на ${number(defense.rangedReduction * 100)}%; магия не ослабляется.`,
        `Итоговый шанс парирования ближнего удара — ${number(defense.meleeParryChance * 100)}%; уклонение и Контрудар отключены.`,
        `Для физического контакта нужно ${String(defense.hitEnergy)} энергии; парирование стоит ${String(defense.parryEnergy)}, принятый удар — ${String(defense.hitEnergy)} вместо стандартной потери.`,
        'Энергия не восстанавливается; при нехватке сил стойка снимается до защиты.',
        `После выхода повторный вход доступен через ${number(defense.reentryMs / 1000)} секунду.`,
        ...(defense.rangedParryChance > 0
            ? [
                  `Шанс парирования дальнего физического удара — ${number(defense.rangedParryChance * 100)}%.`,
              ]
            : []),
    ]
}
