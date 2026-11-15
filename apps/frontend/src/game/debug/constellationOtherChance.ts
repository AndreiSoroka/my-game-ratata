import type { ConstellationStar } from '../../../../backend/src/game/constellationCatalog'
import {
    chancePercent,
    criticalChance,
    swordDodgeChance,
    theftEffectChances,
} from './constellationChanceMath'
import type { ConstellationEffectChance } from './constellationChanceTypes'
import { describeDeterministicOtherChance } from './constellationOtherChanceDetails'

const specialDescriptions: Record<string, () => ConstellationEffectChance> = {
    'blade.critical': () => describeCritical('blade.critical'),
    'arrow.critical': () => describeCritical('arrow.critical'),
    'blade.dodge': describeDodge,
    'shadow.root': () => describeTheft('shadow.root'),
    'shadow.luck1': () => describeTheft('shadow.luck1'),
    'shadow.luck2': () => describeTheft('shadow.luck2'),
    'shadow.noise1': describeNoise,
    'shadow.noise2': describeNoise,
    'shadow.sight': describeSight,
    'magic.fireball': () => describeFireball('magic.fireball'),
    'magic.greater_fireball': () => describeFireball('magic.greater_fireball'),
    'magic.runic_echo': describeRunicEcho,
}

/** Explanations of resolved effects, deliberately separate from acquiring a star. */
export function describeOtherEffectChance(node: ConstellationStar): ConstellationEffectChance {
    const deterministic = describeDeterministicOtherChance(node.id)
    if (deterministic !== undefined) return deterministic
    const special = specialDescriptions[node.id]
    if (special !== undefined) return special()
    if (['blade.root', 'magic.root', 'arrow.root', 'life.root'].includes(node.id))
        return describeRoot(node.id)
    throw new Error(`Не описана вероятность эффекта звезды: ${node.id}`)
}

function describeCritical(id: string): ConstellationEffectChance {
    const sword = id === 'blade.critical'
    return {
        summary:
            'Бонус +3 п.п. применяется всегда при подходящей атаке; критический удар остаётся случайным.',
        formulas: [
            'Шанс крита C = min(95%, C₀ + 3 п.п.).',
            'P(критического попадания) = (1 − Dцели) × C.',
        ],
        examples: [
            {
                label: 'При исходном критическом шансе 5%',
                value: `${chancePercent(criticalChance(0.05, 0.03))} после бонуса.`,
            },
            {
                label: 'При исходном критическом шансе 94%',
                value: `${chancePercent(criticalChance(0.94, 0.03))}: действует верхний предел.`,
            },
            {
                label: 'При C₀ = 5% и уклонении цели 5%',
                value: `${chancePercent(0.95 * criticalChance(0.05, 0.03))} критических попаданий до учёта Барьера.`,
            },
        ],
        notes: [
            'C₀ — базовый критический шанс персонажа. В текущих правилах экипировка не добавляет крит; Dцели — её итоговое уклонение.',
            sword
                ? 'Для этого бонуса нужен обычный удар исправным simple_sword или old_sword. Он не повышает крит Искры или Выстрела.'
                : 'Этот бонус действует только на Выстрел и не получает дополнительно бонус крита меча.',
            'Геометрия и доступность цели проверяются заранее. Барьер может поглотить даже критическое попадание целиком.',
        ],
    }
}

function describeDodge(): ConstellationEffectChance {
    return {
        summary:
            'При исправном мече +3 п.п. добавляются всегда; само уклонение проверяется случайным броском.',
        formulas: [
            'D = min(95%, clamp(0%, 95%, D₀ + E) + 3 п.п.).',
            'Без исправного меча: D = clamp(0%, 95%, D₀ + E).',
        ],
        examples: [
            {
                label: 'При базовом уклонении 5%, без бонусов экипировки, с мечом',
                value: chancePercent(swordDodgeChance(0.05, 0, true)),
            },
            {
                label: 'При тех же 5%, но без исправного меча',
                value: chancePercent(swordDodgeChance(0.05, 0, false)),
            },
            {
                label: 'При базовых 94% и +2 п.п. от экипировки, с мечом',
                value: chancePercent(swordDodgeChance(0.94, 0.02, true)),
            },
        ],
        notes: [
            'D₀ — базовое уклонение; E — сумма бонусов исправных надетых предметов. clamp ограничивает значение указанными границами.',
            'Бросок уклонения есть у обычных атак, Искры и Выстрела. Прямое применение Огненного шара сейчас этот бросок не вызывает.',
        ],
    }
}

function describeTheft(id: string): ConstellationEffectChance {
    const bonus = id === 'shadow.luck2' ? 0.06 : id === 'shadow.luck1' ? 0.03 : 0
    const behind = theftEffectChances(1, 1, false, bonus)
    const front = theftEffectChances(1, 1, true, bonus)
    return {
        summary:
            bonus === 0
                ? 'Кража имеет два броска: сначала обнаружение, затем получение предмета, если вас не обнаружили.'
                : 'Бонус применяется в 100% допустимых попыток, но сама кража остаётся двухэтапной случайной проверкой.',
        formulas: [
            'D = clamp(10%, 90%, 68% − 3 п.п. × (S − 1) − 2 п.п. × (T − 1) + F).',
            'U = clamp(5%, 90%, 25% + 4 п.п. × T + 1,5 п.п. × S + A + B).',
            'P(незаметно украсть) = (1 − D) × U; P(пойман) = D; P(тихая неудача) = (1 − D) × (1 − U).',
        ],
        examples: [
            {
                label: 'S = 1, T = 1, сзади',
                value: `Обнаружение ${chancePercent(behind.detected)}; получение при незамеченности ${chancePercent(behind.success)}; незаметная кража ${chancePercent(behind.unnoticed)}.`,
            },
            {
                label: 'S = 1, T = 1, спереди',
                value: `Обнаружение ${chancePercent(front.detected)}; получение при незамеченности ${chancePercent(front.success)}; незаметная кража ${chancePercent(front.unnoticed)}.`,
            },
        ],
        notes: [
            `S — Скрытность, T — Воровство. F: +12 п.п. спереди или −8 п.п. иначе; A: 0 спереди или +10 п.п. иначе. Здесь B = ${chancePercent(bonus)}.`,
            'Одна звезда удачи даёт B = 3 п.п.; обе вместе — 6 п.п. Бонус добавляется к U, а не к общему исходу, и не уменьшает D.',
            'Сначала проверяются живая цель, дистанция, видимость, ресурсы, кулдауны, свободное место и существующий доступный предмет. Отвергнутая команда не делает этих бросков.',
        ],
    }
}

function describeNoise(): ConstellationEffectChance {
    return {
        summary: '100%: при настоящих шагах крадучись громкость уменьшается без случайного броска.',
        formulas: [
            'Радиус шума = 64 × Mповерхности × 0,18 × (1 − 0,035 × (S − 1)) × (1 − 0,15 × N).',
        ],
        examples: [],
        notes: [
            'S — уровень Скрытности; N — число изученных звёзд тишины, 1 или 2. Вместе они уменьшают этот множитель на 30%, не на 27,75%.',
            'Поверхность и препятствия учитываются отдельно. Стояние не создаёт шагов, а рывок использует собственную громкость без этого тихого множителя.',
        ],
    }
}

function describeSight(): ConstellationEffectChance {
    return {
        summary:
            '100%: радиус обнаружения уменьшается по геометрическим правилам, а не по шансу невидимости.',
        formulas: ['Rвидимости = min(R₀, max(28, R₀ × F × (1 − 0,03 × (S − 1)) × 0,90)).'],
        examples: [],
        notes: [
            'R₀ — исходный радиус наблюдателя, S — Скрытность цели; расстояния здесь в мировых пикселях.',
            'F = 0,65 спереди, 0,35 сзади, 0,50 сбоку: определяется углом к направлению взгляда наблюдателя.',
            'Нужно двигаться крадучись, не находиться в рывке и не атаковать в последнюю секунду. Сохраняются проверки прямой видимости; это не гарантирует незаметность.',
        ],
    }
}

function describeFireball(id: string): ConstellationEffectChance {
    const greater = id === 'magic.greater_fireball'
    return {
        summary:
            '100% применения при допустимой цели, без бросков на случайное уклонение или крит. Барьер может полностью поглотить урон.',
        formulas: [
            `Рассчитанный урон = round((${greater ? '18 + 3' : '8 + 2'} × (L − 1)) × Kжара).`,
            'Потеря HP = min(текущий HP, max(0, урон − поглощение Барьера)).',
        ],
        examples: [],
        notes: [
            'L — уровень соответствующего огненного шара. Kжара = 1,10 при изученном «Жаре», иначе 1.',
            'Сервер проверяет изучение заклинания, живую допустимую цель, одну локацию, дальность, видимость, ману, кулдаун и возможность действовать. По могиле также проверяется её состояние.',
        ],
    }
}

function describeRunicEcho(): ConstellationEffectChance {
    return {
        summary:
            '100%: полезное попадание боевым заклинанием даёт один заряд; дополнительного броска на усиление нет.',
        formulas: [
            'Заряд действует только при now < время последнего полезного попадания заклинанием + 5000 мс.',
            'Следующий Выстрел получает множитель ×1,10 перед итоговым округлением урона.',
        ],
        examples: [
            {
                label: 'Полезное заклинание попало в 1000 мс, выстрел начат в 5999 мс',
                value: 'Усиление действует: ×1,10.',
            },
            {
                label: 'То же попадание в 1000 мс, выстрел начат в 6000 мс',
                value: 'Усиление уже истекло.',
            },
        ],
        notes: [
            'Заряд расходуется при запуске оплаченного Выстрела, даже если затем случится промах или уклонение. Новое полезное заклинание обновляет время, но не складывает заряды.',
            'Усиленный выстрел может быть направлен в другую допустимую цель. Уклонение, крит и поглощение Барьером остаются отдельными проверками.',
            'Не путайте с открытием звезды: там нужны два полезных попадания по одной цели за ≤5000 мс включительно; здесь конец действия заряда строгий.',
        ],
    }
}

function describeRoot(id: string): ConstellationEffectChance {
    if (id === 'magic.root') {
        return {
            summary:
                'Искра использует боевые броски; допустимая активация Барьера происходит без случайного отказа.',
            formulas: [
                'P(попадания Искры до Барьера) = 1 − Dцели.',
                'P(критического попадания Искры) = (1 − Dцели) × min(95%, C₀).',
                'P(активации Барьера) = 100% при допустимой команде; поглощение = min(урон, остаток Барьера).',
            ],
            examples: [
                {
                    label: 'Если у цели 5% уклонения, а у мага 5% крита',
                    value: 'Искра: 95% попаданий, 4,75% критических попаданий до Барьера.',
                },
            ],
            notes: [
                'C₀ — базовый крит персонажа, Dцели — действующее уклонение цели. Бонус крита меча к Искре не добавляется.',
                'Полностью поглощённое попадание не уменьшает HP. Для команды по-прежнему нужны изученная способность, ресурсы и готовность действовать.',
            ],
        }
    }
    if (id === 'blade.root' || id === 'arrow.root') {
        return {
            summary:
                'Сам корень не добавляет случайного эффекта. Для допустимого обычного удара или Выстрела действуют боевые броски.',
            formulas: [
                'P(попадания до Барьера) = 1 − Dцели.',
                'P(критического попадания) = (1 − Dцели) × min(95%, C₀ + подходящий бонус крита).',
            ],
            examples: [
                {
                    label: 'Если у цели 5% уклонения и геометрия атаки допустима',
                    value: '95% попаданий до проверки поглощения Барьером.',
                },
            ],
            notes: [
                'Dцели — её действующее уклонение; C₀ — критический шанс атакующего. Нельзя вывести единую вероятность из одного факта открытия корня.',
                'Цена, видимость, дистанция, направление, жизнь цели и состояние атакующего проверяются до эффекта.',
            ],
        }
    }
    return {
        summary:
            '100% при выполнении условий: корень сам по себе не добавляет случайного эффекта или нового бонуса.',
        formulas: [
            'Отдельный бросок корня отсутствует; действуют правила соответствующего действия и изученных дочерних звёзд.',
        ],
        examples: [],
        notes: [
            'Сам корень не меняет численные характеристики: их уточнения и улучшения описаны у дочерних звёзд.',
        ],
    }
}
