import {
    ASH_RULES,
    type AshRiteId,
    isArcaneAbility,
    isArrowAbility,
    isAshRiteId,
    isBladeAbility,
    isFireSpell,
    resolveAshParameters,
} from '@my-game-ratata/contracts'

import { arrowCardEffects } from './constellationArrowEffects'
import { bladeTechniqueCardResults } from './constellationBladeEffects'
import { resolveConstellationBonuses } from './constellationBonuses'
import {
    appendLearnedEffect,
    authoredEffectRow,
    type EffectRow,
    effectRow,
} from './constellationEffectText'
import { magicCardEffects } from './constellationMagicEffects'
import { fullConstellationCatalog } from './constellationNodes'
import {
    appendAshPrayer,
    appendHealingPrayer,
} from './constellationPrayerEffects'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
interface Context {
    learned: ReadonlySet<string>
    bonuses: Bonuses
}
const nodes = new Map(fullConstellationCatalog.map((node) => [node.id, node]))
const numberFormat = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
})
const number = (value: number) => numberFormat.format(value)
const percent = (value: number) => number(value * 100)
const englishFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const englishPercent = (value: number) => englishFormat.format(value * 100)

/** Earned capabilities for one card; it never discloses unlearned descendants. */
export function resolveConstellationCardEffectRows(
    nodeId: string,
    learnedIds: ReadonlySet<string>
): EffectRow[] | undefined {
    const node = nodes.get(nodeId)
    if (node === undefined) {
        return undefined
    }
    const effects = [...(node.results ?? []), ...(node.effects ?? [])].map(
        (text) => authoredEffectRow(node, text)
    )
    if (node.effectType !== 'active') {
        return effects.length === 0 ? undefined : effects
    }
    if (isBladeAbility(node.activationAbilityId)) {
        return bladeTechniqueCardResults(
            node.activationAbilityId,
            resolveConstellationBonuses(learnedIds)
        )
    }
    const context: Context = {
        learned: learnedIds,
        bonuses: resolveConstellationBonuses(learnedIds),
    }
    const ability = node.activationAbilityId
    if (isArcaneAbility(ability)) {
        effects.push(...magicCardEffects(ability, context.bonuses, learnedIds))
        if (isFireSpell(ability)) {
            appendLearnedEffect(effects, learnedIds, 'magic.insight')
        }
    } else {
        appendActiveEffects(effects, ability, context)
    }
    return effects.length > 0
        ? [...new Map(effects.map((row) => [row[0], row])).values()]
        : undefined
}
function appendActiveEffects(
    effects: EffectRow[],
    ability: string | undefined,
    context: Context
): void {
    if (isArrowAbility(ability)) {
        effects.push(
            ...arrowCardEffects(ability, context.bonuses, context.learned)
        )
        return
    }
    if (isAshRiteId(ability)) {
        effects.push(...ashRiteCardEffects(ability, context.learned))
        return
    }
    switch (ability) {
        case 'pray':
            appendHealingPrayer(effects, context, false)
            break
        case 'pray_woven':
            effects.push(
                effectRow('Лечит вас или союзника.', 'Heals you or an ally.'),
                effectRow(
                    'Очищает могилы от тёмных сил.',
                    'Cleanses graves of dark forces.'
                )
            )
            appendHealingPrayer(effects, context, true)
            break
        case 'pray_grave':
            appendAshPrayer(effects, context.learned)
            break
        case 'pray_road':
            appendLearnedEffect(effects, context.learned, 'prayer_road.walk')
            appendLearnedEffect(
                effects,
                context.learned,
                'prayer_road.shoulder'
            )
            appendLearnedEffect(effects, context.learned, 'prayer_road.bard')
            break
        case 'pray_lantern':
            break
        default:
            throw new Error(
                `Missing active card effects: ${ability ?? 'undefined'}`
            )
    }
}

function ashRiteCardEffects(
    ability: AshRiteId,
    learned: ReadonlySet<string>
): EffectRow[] {
    if (ability === 'ash_raise') {
        const ash = resolveAshParameters(learned)
        return [
            effectRow(
                `Прислужники: до ${String(ash.raiseSlots)} одновременно, ${String(ash.raiseDurationMs / 1000)} с, ${percent(ash.raiseHpFraction)}% HP при подъёме.`,
                `Servants: up to ${String(ash.raiseSlots)} at once, lasting ${String(ash.raiseDurationMs / 1000)} s and rising with ${englishPercent(ash.raiseHpFraction)}% HP.`
            ),
            effectRow(
                `Обряд: ${String(ash.raiseWindupMs)} мс и ${String(ASH_RULES.raiseMana)} MP.`,
                `Rite: ${String(ash.raiseWindupMs)} ms and ${String(ASH_RULES.raiseMana)} MP.`
            ),
        ]
    }
    if (ability === 'ash_exhaustion') {
        const { drain, chanceBonus, reductions } = ASH_RULES.exhaustion
        const { exhaustionRank } = resolveAshParameters(learned)
        const effects = [
            effectRow(
                `Попадание истощает здоровье, ману и энергию на ${String(drain)} ед. каждое.`,
                `A hit drains ${String(drain)} each from health, mana and energy.`
            ),
            effectRow(
                `Шанс проклятия равен шансу ответа Праха плюс ${percent(chanceBonus)} п.п.`,
                `The curse chance is the Ash Guardian’s answer chance plus ${englishPercent(chanceBonus)} percentage points.`
            ),
        ]
        const reduction = reductions[exhaustionRank - 1]
        if (reduction !== undefined && exhaustionRank > 1) {
            effects.push(
                effectRow(
                    `Текущий ранг: ${String(exhaustionRank)}. Проклятие снижает максимумы ресурсов на ${percent(reduction)}%.`,
                    `Current rank: ${String(exhaustionRank)}. The curse reduces maximum resources by ${englishPercent(reduction)}%.`
                )
            )
        }
        return effects
    }
    const node = fullConstellationCatalog.find(
        (candidate) => candidate.activationAbilityId === ability
    )
    return node === undefined ? [] : [authoredEffectRow(node, node.description)]
}

export function resolveConstellationCardEffects(
    nodeId: string,
    learnedIds: ReadonlySet<string>
): string[] | undefined {
    return resolveConstellationCardEffectRows(nodeId, learnedIds)?.map(
        ([russian]) => russian
    )
}
