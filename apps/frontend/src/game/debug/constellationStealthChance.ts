import {
    MOVEMENT_RULES,
    resolveStealthTheftBonuses,
    resolveTheftChances,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import { chanceFormula, withChanceFormulas } from './constellationChanceFormula'
import { chancePercent } from './constellationChanceMath'
import type { ConstellationEffectChance } from './constellationChanceTypes'
import { constellationStarPlan } from './constellationMasteryPlan'

type Bonuses = ReturnType<typeof resolveStealthTheftBonuses>

export function describeStealthTheftChance(
    node: ConstellationStar,
    active?: ReadonlySet<string>
): ConstellationEffectChance {
    const bonuses = resolveStealthTheftBonuses(active ?? constellationStarPlan(node.id).ids)
    return node.constellationId === 'shadow'
        ? describeStealth(node, bonuses)
        : describeTheft(node, bonuses)
}

function describeStealth(node: ConstellationStar, bonuses: Bonuses): ConstellationEffectChance {
    const speed = chanceFormula(
        'Скорость крадучись',
        `V × ${MOVEMENT_RULES.sneakSpeedMultiplier} × S`,
        { V: 'Скорость обычной ходьбы.', S: 'Множитель изученных звёзд движения.' }
    )
    const noise = chanceFormula(
        'Исходный радиус шума шага крадучись, пиксели',
        `${MOVEMENT_RULES.walkingNoiseRadius} × ${MOVEMENT_RULES.sneakNoiseMultiplier} × M × N`,
        { M: 'Множитель громкости поверхности.', N: 'Множитель изученных звёзд тихого шага.' }
    )
    const sight = chanceFormula('Радиус обнаружения, пиксели', 'min(R, max(28, R × F × W))', {
        R: 'Базовый радиус зрения наблюдателя.',
        F: 'Множитель направления взгляда: 0,65 спереди, 0,50 сбоку, 0,35 сзади.',
        W: 'Множитель изученных звёзд сокрытия.',
    })
    const details = node.id.startsWith('shadow.speed')
        ? [speed]
        : node.id.startsWith('shadow.noise')
          ? [noise]
          : node.id.startsWith('shadow.sight')
            ? [sight]
            : [speed, noise, sight]
    return withChanceFormulas(
        {
            deterministic: true,
            summary: 'Обнаружение крадущегося подчиняется геометрическим правилам зрения и слуха.',
            examples: [
                {
                    label: 'Скорость крадучись от обычной ходьбы',
                    value: chancePercent(
                        MOVEMENT_RULES.sneakSpeedMultiplier * bonuses.sneakSpeedMultiplier
                    ),
                },
                {
                    label: 'Множитель шума шага',
                    value: chancePercent(bonuses.sneakNoiseMultiplier),
                },
                {
                    label: 'Множитель дальности обнаружения',
                    value: chancePercent(bonuses.sneakSightMultiplier),
                },
            ],
            notes: [
                'Прямая линия обзора позволяет заметить крадущегося в пределах 28 пикселей. Рывок и недавняя атака раскрывают персонажа.',
                'Шаги возникают при реальном движении. Все три звезды тихого шага вместе сокращают радиус шума на 35%.',
            ],
        },
        details
    )
}

function describeTheft(node: ConstellationStar, bonuses: Bonuses): ConstellationEffectChance {
    const front = resolveTheftChances(true, bonuses)
    const rear = resolveTheftChances(false, bonuses)
    const outcomes = {
        D: 'Риск поимки в процентах после бонуса за подход сзади.',
        U: 'Шанс извлечь предмет после успешной проверки незаметности, в процентах.',
    }
    const costs = [
        chanceFormula('Цена допустимой попытки, EN', `${THEFT_RULES.energyCost} − E`, {
            E: 'Снижение расхода энергии изученными звёздами.',
        }),
        chanceFormula('Общий кулдаун кражи, мс', `${THEFT_RULES.cooldownMs} − T`, {
            T: 'Сокращение общего кулдауна изученными звёздами.',
        }),
        chanceFormula('Кулдаун кражи у той же цели, мс', String(THEFT_RULES.pairCooldownMs)),
    ]
    const checks = [
        chanceFormula('Шанс успешной кражи, %', '(1 − D / 100) × U', outcomes),
        chanceFormula('Шанс поимки, %', 'D', { D: outcomes.D }),
        chanceFormula('Шанс тихого промаха, %', '(1 − D / 100) × (100 − U)', outcomes),
    ]
    const root = node.kind === 'root'
    const tempo = ['theft.economy', 'theft.tempo', 'theft.rhythm'].includes(node.id)
    return withChanceFormulas(
        {
            ...(!root && { deterministic: true }),
            summary: root
                ? 'Сначала проверяется риск поимки. Если попытка осталась незамеченной, выполняется бросок на извлечение предмета.'
                : node.description,
            examples: [theftExample('Со спины', rear), theftExample('Спереди или сбоку', front)],
            notes: [
                'Числа приведены для выбранных звёзд без временных эффектов. Прежде чем бросать, сервер проверяет цель, видимость, силы, кулдауны и свободное место.',
            ],
        },
        root ? [...checks, ...costs] : tempo ? costs : checks
    )
}

function theftExample(label: string, odds: ReturnType<typeof resolveTheftChances>) {
    const missed = 1 - odds.detected - odds.unnoticed
    return {
        label,
        value: `Успех ${chancePercent(odds.unnoticed)}, поимка ${chancePercent(odds.detected)}, тихий промах ${chancePercent(missed)}.`,
    }
}
