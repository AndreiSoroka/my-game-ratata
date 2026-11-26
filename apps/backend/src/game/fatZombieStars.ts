import { type ConstellationStar, star } from './constellationDefinition'
import type { SkyPoint } from './constellationGeometry'

export interface FatZombieBonuses {
    physicalResistance: number
    stunReduction: number
    idleHpRegen: number
    movingHpRegen: number
    energyCapacity: number
    energyDiscount: number
    idleEnergyRegen: number
    movingEnergyRegen: number
    reachTiles: number
    halfWidthTiles: number
    pushTiles: number
    moveSpeed: number
    windupReductionMs: number
    movementLockReductionMs: number
    cycleReductionMs: number
}

type StarSpec = readonly [
    name: string,
    description: string,
    bonuses: Partial<FatZombieBonuses>,
]

const branches = {
    body: [
        [
            'Жировая прослойка',
            'Получаемый физический урон ниже на 3%.',
            { physicalResistance: 0.03 },
        ],
        [
            'Тяжёлая опора',
            'Получаемое оглушение на 8% короче.',
            { stunReduction: 0.08 },
        ],
        [
            'Толстая шкура',
            'Защита от физического урона выше ещё на 4 процентных пункта.',
            { physicalResistance: 0.04 },
        ],
        [
            'Устойчивость',
            'Сокращение длительности оглушения увеличено ещё на 8 процентных пунктов.',
            { stunReduction: 0.08 },
        ],
        [
            'Плотный нарост',
            'Защита от физического урона выше ещё на 5 процентных пунктов.',
            { physicalResistance: 0.05 },
        ],
        [
            'Несгибаемая масса',
            'Сокращение длительности оглушения увеличено ещё на 9 процентных пунктов.',
            { stunReduction: 0.09 },
        ],
    ],
    rot: [
        [
            'Вялая регенерация',
            'В покое восстанавливается дополнительно 0,03 HP в секунду.',
            { idleHpRegen: 0.03 },
        ],
        [
            'Запас сил',
            'Максимальный запас энергии увеличен на 20.',
            { energyCapacity: 20 },
        ],
        [
            'Живучая плоть',
            'При ходьбе восстанавливается дополнительно 0,02 HP в секунду.',
            { movingHpRegen: 0.02 },
        ],
        [
            'Бережный удар',
            'Обычный удар расходует на 1 единицу энергии меньше.',
            { energyDiscount: 1 },
        ],
        [
            'Гнилостный покой',
            'В покое восстанавливается ещё 0,04 HP в секунду.',
            { idleHpRegen: 0.04 },
        ],
        [
            'Второе дыхание',
            'Восстанавливается дополнительно 1 единица энергии в секунду в покое и 0,5 на ходу.',
            { idleEnergyRegen: 1, movingEnergyRegen: 0.5 },
        ],
    ],
    push: [
        [
            'Длинная лапа',
            'Дальность обычного удара увеличена на 0,05 клетки.',
            { reachTiles: 0.05 },
        ],
        [
            'Тяжёлый замах',
            'Обычный удар отбрасывает ещё на 0,15 клетки.',
            { pushTiles: 0.15 },
        ],
        [
            'Вытянутая рука',
            'Дальность обычного удара увеличена ещё на 0,05 клетки.',
            { reachTiles: 0.05 },
        ],
        [
            'Таран',
            'Обычный удар отбрасывает ещё на 0,15 клетки.',
            { pushTiles: 0.15 },
        ],
        [
            'Широкий хват',
            'Полуширина обычного удара увеличена на 0,1 клетки.',
            { halfWidthTiles: 0.1 },
        ],
        [
            'Громоздкий напор',
            'Обычный удар отбрасывает ещё на 0,2 клетки.',
            { pushTiles: 0.2 },
        ],
    ],
    stride: [
        [
            'Шаркающий шаг',
            'Скорость движения выше на 2 пикселя в секунду.',
            { moveSpeed: 2 },
        ],
        [
            'Нетерпение',
            'Замах обычного удара короче на 20 мс.',
            { windupReductionMs: 20 },
        ],
        [
            'Упорство',
            'Скорость движения выше ещё на 2 пикселя в секунду.',
            { moveSpeed: 2 },
        ],
        [
            'Тяжёлый шаг',
            'После начала атаки можно двигаться на 60 мс раньше.',
            { movementLockReductionMs: 60 },
        ],
        [
            'Неотступность',
            'Скорость движения выше ещё на 2 пикселя в секунду.',
            { moveSpeed: 2 },
        ],
        [
            'Размеренный бой',
            'Цикл обычного удара короче на 160 мс.',
            { cycleReductionMs: 160 },
        ],
    ],
} satisfies Record<string, readonly StarSpec[]>

const parentRanks = [[], [1], [2], [3], [3], [4, 5]] as const
const rotatedBranchTemplate = [
    { x: 300, y: 12 },
    { x: 605, y: -25 },
    { x: 915, y: 0 },
    { x: 1230, y: -165 },
    { x: 1210, y: 175 },
    { x: 1530, y: 15 },
]

interface FatZombieStar extends ConstellationStar {
    bonuses: Partial<FatZombieBonuses>
}

export const fatZombieStars: readonly FatZombieStar[] = Object.entries(
    branches
).flatMap(([branch, specs]) =>
    specs.map(([name, description, bonuses], index) => {
        const ranks = parentRanks[index] ?? []
        const parents =
            ranks.length === 0
                ? ['root']
                : ranks.map((rank) => `${branch}${String(rank)}`)
        return {
            ...star(
                'fat_zombie',
                `${branch}${String(index + 1)}`,
                name,
                description,
                parents
            ),
            acquisition: 'event' as const,
            minimumLevel: 0,
            bonuses,
        }
    })
)

export const fatZombieTemplatePositions: Readonly<Record<string, SkyPoint>> = {
    'fat_zombie.root': { x: 0, y: 0 },
    ...Object.fromEntries(
        Object.keys(branches).flatMap((branch, quarter) =>
            rotatedBranchTemplate.map(({ x, y }, index) => {
                const angle = (quarter * Math.PI) / 2
                return [
                    `fat_zombie.${branch}${String(index + 1)}`,
                    {
                        x: Math.round(
                            x * Math.cos(angle) - y * Math.sin(angle)
                        ),
                        y: Math.round(
                            x * Math.sin(angle) + y * Math.cos(angle)
                        ),
                    },
                ]
            })
        )
    ),
}
