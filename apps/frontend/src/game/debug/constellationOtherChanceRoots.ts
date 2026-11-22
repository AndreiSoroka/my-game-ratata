import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import type { ConstellationEffectChance } from './constellationChanceTypes'

const targetDodge = 'Итоговое уклонение цели в процентах.'
const baseCritical =
    'Базовый критический шанс атакующего в процентах; экипировка сейчас не добавляет крит.'

export function describeOtherRootChance(id: string): ConstellationEffectChance {
    if (id === 'magic.root') return describeMagicRoot()
    if (id === 'blade.root' || id === 'arrow.root') {
        return withChanceFormulas(
            {
                ...(id === 'blade.root' ? { deterministic: true } : {}),
                summary:
                    'Сам корень не добавляет случайного эффекта. Для допустимого обычного удара или Выстрела действуют боевые броски.',
                examples: [
                    {
                        label: 'Если у цели 5% уклонения и геометрия атаки допустима',
                        value: '95% попаданий до проверки поглощения Барьером.',
                    },
                ],
                notes: [
                    'Нельзя вывести единую вероятность из одного факта открытия корня. Цена, видимость, дистанция, направление, жизнь цели и состояние атакующего проверяются до эффекта.',
                ],
            },
            [
                chanceFormula('Шанс попадания до Барьера, %', '100 − D', { D: targetDodge }),
                chanceFormula(
                    'Шанс критического попадания до Барьера, %',
                    '(1 − D / 100) × min(95, C + B)',
                    {
                        D: targetDodge,
                        C: baseCritical,
                        B:
                            id === 'blade.root'
                                ? '3 п.п. при изученном бонусе крита и обычном ударе исправным мечом; иначе 0.'
                                : '3 п.п. при изученном бонусе крита Выстрела; иначе 0. Бонус меча к Выстрелу не добавляется.',
                    }
                ),
            ]
        )
    }
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100% при выполнении условий: корень сам по себе не добавляет случайного эффекта или нового бонуса.',
            examples: [],
            notes: [
                'Отдельный бросок корня отсутствует. Сам корень не меняет численные характеристики: их уточнения и улучшения описаны у дочерних звёзд.',
            ],
        },
        [chanceFormula('Применение изученных правил без отдельного броска корня', '100%')]
    )
}

function describeMagicRoot(): ConstellationEffectChance {
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                'Искра использует боевые броски; допустимая активация Барьера происходит без случайного отказа.',
            examples: [
                {
                    label: 'Если у цели 5% уклонения, а у мага 5% крита',
                    value: 'Искра: 95% попаданий, 4,75% критических попаданий до Барьера.',
                },
            ],
            notes: [
                'Бонус крита меча к Искре не добавляется. Полностью поглощённое попадание не уменьшает HP. Для команды по-прежнему нужны изученная способность, ресурсы и готовность действовать.',
            ],
        },
        [
            chanceFormula('Шанс попадания Искры до Барьера, %', '100 − D', { D: targetDodge }),
            chanceFormula('Шанс критического попадания Искры, %', '(1 − D / 100) × min(95, C)', {
                D: targetDodge,
                C: baseCritical,
            }),
            chanceFormula('Шанс активации Барьера при допустимой команде', '100%'),
            chanceFormula('Поглощение одного попадания Барьером', 'min(D, M / K)', {
                D: 'Входящий урон.',
                M: 'Текущий запас маны.',
                K: 'Цена единицы поглощённого урона: 1 MP или 0,8 MP с Крепкой гранью.',
            }),
        ]
    )
}
