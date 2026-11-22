import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    CITY_PORTAL_MANA_FRACTION,
    isArrowAbility,
    isBladeAbility,
    isFireSpell,
    MAGIC_ABILITY_RULES,
} from '@my-game-ratata/contracts'

import { resolveConstellationBonuses } from '../../../../backend/src/game/constellationBonuses'
import { resolveConstellationCardEffects } from '../../../../backend/src/game/constellationCardEffects'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { describeArrowActionBuild } from './constellationArrowBuild'
import { describeBladeActionBuild } from './constellationBladeBuild'
import { constellationDistance } from './constellationDistance'
import { describePassiveConstellationBuild } from './constellationPassiveBuild'

export interface ConstellationBuildSummary {
    name?: string
    effectType?: 'active' | 'passive'
    activationAbilityId?: AbilityId
    available?: boolean
    rows: Array<{ label: string; value: string }>
    effects?: string[]
}
export interface ConstellationBuildOptions {
    runicCharged?: boolean
    tileWidth?: number
}
type Bonuses = ReturnType<typeof resolveConstellationBonuses>
const number = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 5 }).format(value)
const multiplier = (value: number) => `×${number(value)}`
const row = (label: string, value: string | number) => ({ label, value: String(value) })

/** A passive owns its contribution; an active action owns its complete learned build. */
export function describeConstellationBuild(
    nodeId: string,
    activeIds: ReadonlySet<string>,
    options: ConstellationBuildOptions = {}
): ConstellationBuildSummary {
    const node = fullConstellationCatalog.find(
        (entry) => entry.id === (nodeId.includes('.') ? nodeId : `${nodeId}.root`)
    )
    if (node === undefined || node.constellationId.startsWith('prayer')) return { rows: [] }
    const available = activeIds.has(node.id)
    const metadata = {
        name: node.name,
        effectType: node.effectType,
        activationAbilityId: node.activationAbilityId,
        available,
    }
    if (node.effectType === 'passive')
        return { ...metadata, ...describePassiveConstellationBuild(node) }
    if (!available) return { ...metadata, rows: [] }
    const bonuses = resolveConstellationBonuses(activeIds)
    const result = activeResult(node.activationAbilityId, activeIds, bonuses, options)
    return { ...metadata, ...result }
}
function activeResult(
    ability: AbilityId | undefined,
    activeIds: ReadonlySet<string>,
    bonuses: Bonuses,
    options: ConstellationBuildOptions
): ConstellationBuildSummary {
    if (isBladeAbility(ability)) return describeBladeActionBuild(ability, bonuses)
    if (isArrowAbility(ability))
        return describeArrowActionBuild(ability, activeIds, bonuses, options)
    if (ability !== undefined && isFireSpell(ability))
        return fireball(ability, activeIds, bonuses, options)
    if (
        ability === 'chains' ||
        ability === 'blink' ||
        ability === 'dispel_magic' ||
        ability === 'city_portal'
    )
        return utilitySpell(ability, activeIds, bonuses)
    throw new Error(`Missing active result: ${ability}`)
}

function fireball(
    ability: 'fireball' | 'greater_fireball',
    active: ReadonlySet<string>,
    bonuses: Bonuses,
    options: ConstellationBuildOptions
): ConstellationBuildSummary {
    const definition = ABILITY_DEFINITIONS[ability]
    const name = ability === 'greater_fireball' ? 'Большого огненного шара' : 'Огненной стрелы'
    const baseDamage = definition.damage!
    const maxDamage = definition.maxDamage ?? baseDamage
    const damage = (value: number) => Math.round(value * bonuses.fireDamageMultiplier)
    return {
        rows: [
            row(`Урон ${name}`, `${damage(baseDamage)}–${damage(maxDamage)} HP`),
            row(`Множитель урона ${name}`, multiplier(bonuses.fireDamageMultiplier)),
            row(`Дальность ${name}`, constellationDistance(definition.range, 0, options.tileWidth)),
            row('Радиус взрыва, кл.', MAGIC_ABILITY_RULES[ability].radiusTiles),
            row('Цена заклинания, MP', spellCost(definition.mana, bonuses)),
            row('Подготовка заклинания, мс', definition.windupMs),
            row('Кулдаун заклинания, мс', definition.cooldownMs),
        ],
        effects: [
            'Урон может быть поглощён Барьером. Отдельных бросков крита и уклонения нет.',
            ...(active.has('magic.runic_echo')
                ? [
                      'Полезное попадание создаёт заряд «Рунического эха»: следующий Быстрый выстрел на 10% сильнее в течение 5 секунд.',
                  ]
                : []),
        ],
    }
}
function utilitySpell(
    ability: 'chains' | 'blink' | 'dispel_magic' | 'city_portal',
    active: ReadonlySet<string>,
    bonuses: Bonuses
): ConstellationBuildSummary {
    const definition = ABILITY_DEFINITIONS[ability]
    return {
        rows: [
            ability === 'city_portal'
                ? row(
                      'Цена, % максимальной маны',
                      number(CITY_PORTAL_MANA_FRACTION * bonuses.spellManaMultiplier * 100)
                  )
                : row('Цена применения, MP', spellCost(definition.mana, bonuses)),
            row('Кулдаун заклинания, мс', definition.cooldownMs),
        ],
        effects: resolveConstellationCardEffects(`magic.${ability}`, active),
    }
}

function spellCost(base: number, bonuses: Bonuses): number {
    return Math.ceil(base * bonuses.spellManaMultiplier - 1e-10)
}
