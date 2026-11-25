import { HUMAN_MELEE_RULES, resolveBladeDefense } from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../../backend/src/game/constellationBonuses'
import type { ConstellationStar } from '../../../../../backend/src/game/constellationCatalog'
import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import { chancePercent } from './constellationChanceMath'
import type { ConstellationEffectChance } from './constellationChanceTypes'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const contactVariables = {
    D: 'Доступный шанс уклонения цели в процентах; в Глухой обороне равен нулю.',
    P: 'Доступный шанс парирования цели в процентах, ограниченный остатком общего предела 95%.',
    C: 'Итоговый критический шанс атакующего в процентах.',
}

/** These examples explain current Blade rules; card disclosure is still projected independently. */
export function describeBladeEffectChance(
    node: ConstellationStar,
    active?: ReadonlySet<string>
): ConstellationEffectChance | undefined {
    if (node.constellationId !== 'blade' || !node.id.startsWith('blade.')) return undefined
    const learned = active ?? new Set(['blade.root', node.id])
    const bonuses = resolveConstellationBonuses(learned)
    if (node.id.startsWith('blade.stun')) return stunChance(bonuses)
    if (
        ['blade.dodge', 'blade.dodge2', 'blade.arrow_deflect', 'blade.defensive_stance'].includes(
            node.id
        )
    )
        return parryChance(node.id, bonuses)
    if (node.id === 'blade.counterattack') return counterChance()
    if (node.id === 'blade.critical' || node.id === 'blade.critical2') return critical(bonuses)
    if (node.effectType === 'active') return attackChance(node)
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100% применения изученного правила в подходящих условиях, без отдельного случайного броска звезды.',
            examples: [],
            notes: [
                ...(node.results ?? []),
                'Попадание отдельно проверяет геометрию, уклонение, парирование, ресурсы и защиту цели; постоянный бонус не обещает успешную атаку.',
            ],
        },
        [
            chanceFormula('Применение правила при выполненных условиях, %', '100 × I', {
                I: '1, когда изучение, оружие и условия правила соблюдены; иначе 0.',
            }),
        ]
    )
}

function attackChance(node: ConstellationStar): ConstellationEffectChance {
    return withChanceFormulas(
        {
            summary:
                'Каждая законная цель проходит собственную общую проверку контакта; одна цель поражается один раз за действие.',
            examples: [
                {
                    label: 'Без уклонения и парирования',
                    value: '100% допустимых контактов; крит проверяется отдельно для каждой цели.',
                },
            ],
            notes: [
                ...(node.results ?? []),
                'Сначала проверяются жизнь, локация, исправный клинок, полная оплата, занятость, собственный откат, точная область и препятствия.',
            ],
        },
        [
            chanceFormula('Попадание до поглощения, %', '100 − min(95, D + P)', {
                D: contactVariables.D,
                P: contactVariables.P,
            }),
            chanceFormula(
                'Критический контакт до поглощения, %',
                '(1 − min(95, D + P) / 100) × C',
                contactVariables
            ),
        ]
    )
}
function critical(b: Bonuses): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                'Прибавка критического шанса действует всегда для подходящего клинка; сам крит остаётся случайным.',
            examples: [
                {
                    label: 'Обычная человеческая основа с выбранными звёздами',
                    value: chancePercent(
                        Math.min(0.95, HUMAN_MELEE_RULES.critChance + b.swordCritBonus)
                    ),
                },
            ],
            notes: [
                'Для усиления нужен исправный нож или меч. Базовая человеческая вероятность — 15%, каждая звезда точности добавляет 5 п.п. Искра и Выстрел этого усиления не получают.',
            ],
        },
        [
            chanceFormula('Шанс крита, %', 'min(95, C + B)', {
                C: 'Базовый критический шанс в процентах.',
                B: 'Сумма изученных прибавок точности Клинка: 5 или 10 п.п.',
            }),
            chanceFormula(
                'Критический контакт до поглощения, %',
                '(1 − min(95, D + P) / 100) × C',
                contactVariables
            ),
        ]
    )
}
function parryChance(id: string, b: Bonuses): ConstellationEffectChance {
    const guard = resolveBladeDefense(b)
    const chance =
        id === 'blade.arrow_deflect'
            ? guard.rangedParryChance
            : id === 'blade.defensive_stance'
              ? guard.meleeParryChance
              : b.bladeParryChance
    return withChanceFormulas(
        {
            summary: 'Парирование и уклонение — непересекающиеся исходы одного броска защиты.',
            examples: [
                {
                    label: 'Парирование без занимающего часть предела уклонения',
                    value: chancePercent(chance),
                },
            ],
            notes: [
                'Нужен исправный нож или меч. Обычное парирование относится только к ближней физической доставке; Отвод стрелы работает только в Глухой обороне.',
                'Успех расходует 5 энергии. В обороне заранее требуется цена принятого удара; при нехватке стойка снимается до проверки этого контакта.',
                'В стойке уклонение отключено, магия её защитой не ослабляется. Последняя полностью оплаченная защита действует полностью.',
            ],
        },
        [
            chanceFormula('Доступный шанс парирования, %', 'min(P, max(0, 95 − D))', {
                P: 'Итоговый шанс изученного парирования в процентах.',
                D: contactVariables.D,
            }),
        ]
    )
}
function stunChance(b: Bonuses): ConstellationEffectChance {
    return withChanceFormulas(
        {
            summary:
                'Оплаченный обычный удар и Контрудар оглушают только после фактической потери HP у цели.',
            examples: [
                {
                    label: 'Условная вероятность после подходящего попадания',
                    value: chancePercent(b.bladeStunChance),
                },
            ],
            notes: [
                'База — 1%; ступени устанавливают 5%, 10% и 20%, без повторной прибавки базы. Оглушение длится 500 мс до сопротивления.',
                'Полное поглощение без потери HP, ослабленный удар, действующий стан и двухсекундный иммунитет исключают оглушение. Размахи пассивный стан не применяют.',
            ],
        },
        [
            chanceFormula('Шанс оглушения после контакта, %', '100 × S × I', {
                S: 'Текущий шанс: 0.01, 0.05, 0.10 или 0.20.',
                I: '1 после подходящего урона HP без стана и иммунитета; иначе 0.',
            }),
        ]
    )
}
function counterChance(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                'После успешного парирования ответ происходит автоматически, если его условия соблюдены.',
            examples: [],
            notes: [
                'Контрудар расходует эффективную цену обычного удара, не ждёт и не создаёт откат, не изменяет собственный замах.',
                'Нужны живая досягаемая видимая цель и энергия. Молитва, оглушение и Глухая оборона запрещают ответ. Парирование ответа не запускает следующий Контрудар.',
            ],
        },
        [
            chanceFormula('Запуск ответа после парирования, %', '100 × I', {
                I: '1 при соблюдении всех условий немедленной реакции; иначе 0.',
            }),
        ]
    )
}
