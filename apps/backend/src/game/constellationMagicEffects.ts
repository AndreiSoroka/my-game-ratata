import {
    ABILITY_DEFINITIONS,
    type ArcaneAbilityId,
    CITY_PORTAL_MANA_FRACTION,
    MAGIC_ABILITY_RULES,
    PORTAL_LIFETIME_MS,
} from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'
import { type EffectRow, effectRow } from './constellationEffectText'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const englishFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

export function magicCardEffects(
    ability: ArcaneAbilityId,
    bonuses: Bonuses,
    learned: ReadonlySet<string>
): EffectRow[] {
    if (ability === 'city_portal') {
        const seconds = ABILITY_DEFINITIONS.city_portal.windupMs / 1000
        const life = PORTAL_LIFETIME_MS / 1000
        const price =
            100 * CITY_PORTAL_MANA_FRACTION * bonuses.spellManaMultiplier
        return [
            effectRow(
                `Подготовка занимает ${format.format(seconds)} с. Переход действует ${format.format(life)} с.`,
                `Preparation takes ${englishFormat.format(seconds)} s. The portal lasts ${englishFormat.format(life)} s.`
            ),
            effectRow(
                `Цена составляет ${format.format(price)}% максимальной маны. Через портал могут пройти и враги.`,
                `Costs ${englishFormat.format(price)}% of maximum mana. Enemies can also use the portal.`
            ),
        ]
    }
    const cost = Math.ceil(
        ABILITY_DEFINITIONS[ability].mana * bonuses.spellManaMultiplier - 1e-10
    )
    return [
        ...magicEffect(ability, bonuses, learned),
        effectRow(
            `Цена применения — ${format.format(cost)} MP.`,
            `Casting costs ${englishFormat.format(cost)} MP.`
        ),
    ]
}

function magicEffect(
    ability: Exclude<ArcaneAbilityId, 'city_portal'>,
    bonuses: Bonuses,
    learned: ReadonlySet<string>
): EffectRow[] {
    switch (ability) {
        case 'chains': {
            const { chainsDurationMs, chainsPartyImmune, spellManaMultiplier } =
                bonuses
            const { radiusTiles, drainManaPerSecond } =
                MAGIC_ABILITY_RULES.chains
            return [
                effectRow(
                    `Радиус — ${format.format(radiusTiles)} кл. Длительность — до ${format.format(chainsDurationMs / 1000)} с.`,
                    `Radius: ${englishFormat.format(radiusTiles)} tiles. Duration: up to ${englishFormat.format(chainsDurationMs / 1000)} s.`
                ),
                effectRow(
                    `Расходует ${format.format(drainManaPerSecond * spellManaMultiplier)} MP/с во время удержания.`,
                    `Costs ${englishFormat.format(drainManaPerSecond * spellManaMultiplier)} MP/s while held.`
                ),
                chainsPartyImmune
                    ? effectRow(
                          'Живые участники вашего отряда могут перемещаться внутри Оков.',
                          'Living party members can move within Chains.'
                      )
                    : effectRow(
                          'Оковы удерживают также союзников.',
                          'Chains also restrain allies.'
                      ),
            ]
        }
        case 'blink':
            return [
                effectRow(
                    `Скачок на расстояние до ${format.format(MAGIC_ABILITY_RULES.blink.rangeTiles)} кл. Стены и Оковы останавливают смещение.`,
                    `Blink up to ${englishFormat.format(MAGIC_ABILITY_RULES.blink.rangeTiles)} tiles. Walls and Chains stop the movement.`
                ),
            ]
        case 'dispel_magic':
            return [
                effectRow(
                    `Затрагивает обе стороны в радиусе ${format.format(MAGIC_ABILITY_RULES.dispel_magic.radiusTiles)} кл.`,
                    `Affects both sides within ${englishFormat.format(MAGIC_ABILITY_RULES.dispel_magic.radiusTiles)} tiles.`
                ),
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
): EffectRow[] {
    const effects = [
        effectRow(
            `Радиус взрыва — ${format.format(MAGIC_ABILITY_RULES[ability].radiusTiles)} кл. Взрыв поражает союзников и самого мага. Стены защищают.`,
            `Blast radius: ${englishFormat.format(MAGIC_ABILITY_RULES[ability].radiusTiles)} tiles. The blast hits allies and the caster. Walls provide cover.`
        ),
    ]
    if (fireDamageMultiplier > 1) {
        const bonus = 100 * (fireDamageMultiplier - 1)
        effects.push(
            effectRow(
                `Урон Огненной стрелы и Большого огненного шара увеличен на ${format.format(bonus)}%.`,
                `Firebolt and Greater fireball deal ${englishFormat.format(bonus)}% more damage.`
            )
        )
    }
    if (learned.has('magic.runic_echo')) {
        effects.push(
            effectRow(
                'Полезное попадание создаёт рунический заряд, который усиливает следующий Быстрый выстрел на 10% в течение 5 секунд.',
                'A qualifying hit creates a rune charge that makes the next Quick shot within 5 seconds deal 10% more damage.'
            )
        )
    }
    return effects
}
