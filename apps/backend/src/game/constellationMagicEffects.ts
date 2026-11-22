import {
    ABILITY_DEFINITIONS,
    type ArcaneAbilityId,
    CITY_PORTAL_MANA_FRACTION,
    MAGIC_ABILITY_RULES,
    PORTAL_LIFETIME_MS,
} from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function magicCardEffects(
    ability: ArcaneAbilityId,
    bonuses: Bonuses,
    learned: ReadonlySet<string>
): string[] {
    if (ability === 'city_portal') {
        const seconds = format.format(
            ABILITY_DEFINITIONS.city_portal.windupMs / 1000
        )
        const life = format.format(PORTAL_LIFETIME_MS / 1000)
        const price = format.format(
            100 * CITY_PORTAL_MANA_FRACTION * bonuses.spellManaMultiplier
        )
        return [
            `Подготовка занимает ${seconds} с. Переход действует ${life} с.`,
            `Цена составляет ${price}% максимальной маны. Через портал могут пройти и враги.`,
        ]
    }
    const cost = Math.ceil(
        ABILITY_DEFINITIONS[ability].mana * bonuses.spellManaMultiplier - 1e-10
    )
    return [
        ...magicEffect(ability, bonuses, learned),
        `Цена применения — ${format.format(cost)} MP.`,
    ]
}

function magicEffect(
    ability: Exclude<ArcaneAbilityId, 'city_portal'>,
    bonuses: Bonuses,
    learned: ReadonlySet<string>
): string[] {
    switch (ability) {
        case 'chains': {
            const { chainsDurationMs, chainsPartyImmune, spellManaMultiplier } =
                bonuses
            const { radiusTiles, drainManaPerSecond } =
                MAGIC_ABILITY_RULES.chains
            return [
                `Радиус — ${format.format(radiusTiles)} кл. Длительность — до ${format.format(chainsDurationMs / 1000)} с.`,
                `Расходует ${format.format(drainManaPerSecond * spellManaMultiplier)} MP/с во время удержания.`,
                chainsPartyImmune
                    ? 'Живые участники вашего отряда могут перемещаться внутри Оков.'
                    : 'Оковы удерживают также союзников.',
            ]
        }
        case 'blink':
            return [
                `Скачок на расстояние до ${format.format(MAGIC_ABILITY_RULES.blink.rangeTiles)} кл. Стены и Оковы останавливают смещение.`,
            ]
        case 'dispel_magic':
            return [
                `Затрагивает обе стороны в радиусе ${format.format(MAGIC_ABILITY_RULES.dispel_magic.radiusTiles)} кл.`,
            ]
        case 'fireball':
        case 'greater_fireball':
            return fireSpellEffects(ability, bonuses, learned)
        default:
            throw new Error(`Missing active magic card effects: ${ability}`)
    }
}

function fireSpellEffects(
    ability: 'fireball' | 'greater_fireball',
    { fireDamageMultiplier }: Bonuses,
    learned: ReadonlySet<string>
): string[] {
    const effects = [
        `Радиус взрыва — ${format.format(MAGIC_ABILITY_RULES[ability].radiusTiles)} кл. Взрыв поражает союзников и самого мага. Стены защищают.`,
    ]
    if (fireDamageMultiplier > 1) {
        const bonus = format.format(100 * (fireDamageMultiplier - 1))
        effects.push(
            `Урон Огненной стрелы и Большого огненного шара увеличен на ${bonus}%.`
        )
    }
    if (learned.has('magic.runic_echo')) {
        effects.push(
            'Полезное попадание создаёт рунический заряд: следующий Выстрел на 10% сильнее в течение 5 секунд.'
        )
    }
    return effects
}
