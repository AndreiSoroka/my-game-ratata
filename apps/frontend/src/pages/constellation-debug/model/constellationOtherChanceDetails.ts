import { ABILITY_DEFINITIONS, QUICK_SHOT_RULES } from '@my-game-ratata/contracts'

import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import type {
    ConstellationChanceFormula,
    ConstellationEffectChance,
} from './constellationChanceTypes'
import { lifeChanceDetails } from './constellationLifeChanceDetails'
import { magicDeterministicEffects } from './constellationMagicChance'

export interface DeterministicEffect {
    formulas: ConstellationChanceFormula[]
    notes?: string[]
}

const ordinaryAttack =
    'Попадание по допустимой цели отдельно проверяет уклонение и крит; барьер может поглотить весь рассчитанный урон.'
const soundSword =
    'Бонус обычного удара действует только с исправным simple_sword или old_sword; к Искре и Выстрелу он не добавляется.'
const additiveDamage =
    'Вместе две звезды дают +20%, а не +21%. Округление урона выполняется после всех множителей.'
const countDamage = { N: 'Число изученных звёзд усиления этого оружия: 1 или 2.' }
const round = { round: 'Округление до ближайшего целого.' }

const deterministic: Record<string, DeterministicEffect> = {
    'blade.damage1': {
        formulas: [chanceFormula('Множитель урона меча', '1 + 0.10 × N', countDamage)],
        notes: [soundSword, additiveDamage, ordinaryAttack],
    },
    'blade.damage2': {
        formulas: [chanceFormula('Множитель урона меча', '1 + 0.10 × N', countDamage)],
        notes: [soundSword, additiveDamage, ordinaryAttack],
    },
    'blade.economy': {
        formulas: [
            chanceFormula('Расход энергии обычного удара, EN', '0.90 × E', {
                E: 'Исходная цена обычного удара в энергии.',
            }),
        ],
        notes: [
            soundSword,
            'Не отменяет обычные проверки действия и правило ослабленного удара при нехватке ресурсов.',
        ],
    },
    'blade.tempo': {
        formulas: [
            chanceFormula('Интервал, блокировка и подготовка удара, мс', '0.90 × T', {
                T: 'Исходная длительность каждого из этих времён; формула применяется к ним отдельно.',
            }),
        ],
        notes: [soundSword, 'Для ослабленного удара сохраняется дополнительное замедление.'],
    },
    'blade.resolve': {
        formulas: [
            chanceFormula('Длительность нового оглушения, мс', 'round(0.85 × T)', {
                T: 'Исходная длительность нового оглушения в миллисекундах.',
                ...round,
            }),
        ],
        notes: [
            'Не повышает шанс избежать оглушения и не гарантирует прекращение уже более долгого стана. Меч держать не требуется.',
        ],
    },
    'arrow.damage1': {
        formulas: [chanceFormula('Множитель урона Быстрого выстрела', '1 + 0.10 × N', countDamage)],
        notes: [additiveDamage, ordinaryAttack],
    },
    'arrow.damage2': {
        formulas: [chanceFormula('Множитель урона Быстрого выстрела', '1 + 0.10 × N', countDamage)],
        notes: [additiveDamage, ordinaryAttack],
    },
    'arrow.range1': {
        formulas: [
            chanceFormula('Дальность Быстрого выстрела, пиксели', 'R + N × W', {
                R: 'Исходная дальность Быстрого выстрела в мировых пикселях.',
                N: 'Число изученных звёзд дальности: 1 или 2.',
                W: 'Ширина клетки текущей карты в мировых пикселях.',
            }),
        ],
        notes: [
            'Две звезды дают две клетки. Видимость и геометрия попадания не заменяются случайным броском.',
        ],
    },
    'arrow.range2': {
        formulas: [
            chanceFormula('Дальность Быстрого выстрела, пиксели', 'R + N × W', {
                R: 'Исходная дальность Быстрого выстрела в мировых пикселях.',
                N: 'Число изученных звёзд дальности: 1 или 2.',
                W: 'Ширина клетки текущей карты в мировых пикселях.',
            }),
        ],
        notes: [
            'Две звезды дают две клетки. Видимость и геометрия попадания не заменяются случайным броском.',
        ],
    },
    'arrow.economy': {
        formulas: [
            chanceFormula(
                'Цена Быстрого выстрела, EN',
                `${ABILITY_DEFINITIONS.shot.energy} − ${QUICK_SHOT_RULES.energyDiscount} = ${ABILITY_DEFINITIONS.shot.energy - QUICK_SHOT_RULES.energyDiscount}`
            ),
        ],
    },
    'arrow.tempo': {
        formulas: [chanceFormula('Кулдаун Быстрого выстрела, мс', '550 × 0.90 = 495')],
        notes: [
            'Не снимает оглушение, занятость действия или необходимость оплатить следующий выстрел.',
        ],
    },
    ...lifeChanceDetails,
}

interface KnowledgeEffect {
    description: string
    exact?: boolean
}

const knowledge: Record<string, KnowledgeEffect> = {
    'blade.insight1': {
        description:
            'Свой базовый удар: шаг оценки урона 2, интервала 100 мс, критического шанса 2 п.п.',
    },
    'blade.insight2': {
        description: 'Свой базовый удар: точные урон, интервал и критический шанс.',
        exact: true,
    },
    'arrow.insight1': {
        description:
            'Оба своих выстрела: шаг оценки урона 2, интервала 100 мс, критического шанса 2 п.п.',
    },
    'arrow.insight2': {
        description: 'Оба своих выстрела: точные урон, интервал и критический шанс.',
        exact: true,
    },
    'magic.mana1': {
        description: 'Собственные текущая и максимальная мана оцениваются с шагом 25.',
    },
    'magic.mana2': {
        description: 'Собственные текущая и максимальная мана оцениваются с шагом 10.',
    },
    'magic.mana3': {
        description: 'Собственные текущая и максимальная мана известны точно.',
        exact: true,
    },
    'magic.insight': {
        description: 'Точно известны собственные урон, интервал и шанс крита изученных заклинаний.',
        exact: true,
    },
    'life.hp1': {
        description: 'Свой HP: шаг 25; скорость: шаг 0,5 клетки/с; уклонение: шаг 2 п.п.',
    },
    'life.hp2': {
        description: 'Свой HP: шаг 10; скорость: шаг 0,25 клетки/с; уклонение: шаг 1 п.п.',
    },
    'life.hp3': {
        description: 'Свой HP: шаг 5; скорость: шаг 0,125 клетки/с; уклонение: шаг 0,5 п.п.',
    },
    'life.hp4': {
        description: 'Собственные текущий и максимальный HP, скорость и уклонение известны точно.',
        exact: true,
    },
    'life.energy1': {
        description: 'Собственные текущая и максимальная энергия оцениваются с шагом 25.',
    },
    'life.energy2': {
        description: 'Собственные текущая и максимальная энергия оцениваются с шагом 10.',
    },
    'life.energy3': {
        description: 'Собственные текущая и максимальная энергия известны точно.',
        exact: true,
    },
}

export function describeDeterministicOtherChance(
    id: string
): ConstellationEffectChance | undefined {
    const accuracy = knowledge[id]
    if (accuracy !== undefined) return describeKnowledge(accuracy)
    const effect = deterministic[id] ?? magicDeterministicEffects[id]
    if (effect === undefined) return undefined
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                id.startsWith('blade.') && id !== 'blade.resolve'
                    ? '100%: изученный бонус применяется при обычном ударе исправным мечом; отдельного броска нет.'
                    : '100%: изученный бонус применяется при подходящем действии или состоянии; отдельного броска нет.',
            examples: [],
            notes: [...(effect.notes ?? [])],
        },
        effect.formulas
    )
}

function describeKnowledge(accuracy: KnowledgeEffect): ConstellationEffectChance {
    const formula =
        accuracy.exact === true
            ? chanceFormula('Отображаемое точное значение', 'V', {
                  V: 'Фактический собственный показатель.',
              })
            : chanceFormula('Отображаемый диапазон', '[floor(V / S) × S; floor(V / S) × S + S)', {
                  V: 'Фактический собственный показатель; формула применяется отдельно к каждому показателю.',
                  S: 'Шаг его оценки, указанный ниже.',
                  floor: 'Округление вниз до целого; правая граница диапазона не входит в него.',
              })
    return withChanceFormulas(
        {
            deterministic: true,
            summary:
                '100%: изученное знание всегда уточняет собственные показатели; отдельного броска нет.',
            examples: [],
            notes: [
                accuracy.description,
                'Знание не повышает сам показатель и не раскрывает точные чужие значения. Для точного знания диапазон больше не нужен.',
            ],
        },
        [formula]
    )
}
