import {
    isBladeAbility,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import { bladeTechniqueCardResults } from './constellationBladeEffects'
import { resolveConstellationBonuses } from './constellationBonuses'
import { fullConstellationCatalog } from './constellationNodes'
import { prayerAnswerChance } from './prayerProbability'

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
const cells = (value: number) =>
    `${String(value)} ${value === 1 ? 'клетку' : 'клетки'}`

/** Earned capabilities for one card; it never discloses unlearned descendants. */
export function resolveConstellationCardEffects(
    nodeId: string,
    learnedIds: ReadonlySet<string>
): string[] | undefined {
    const node = nodes.get(nodeId)
    if (node === undefined) {
        return undefined
    }
    if (node.effectType !== 'active') {
        const results = [...(node.results ?? []), ...(node.effects ?? [])]
        return results.length === 0 ? undefined : results
    }
    if (isBladeAbility(node.activationAbilityId)) {
        return bladeTechniqueCardResults(
            node.activationAbilityId,
            resolveConstellationBonuses(learnedIds)
        )
    }
    const effects = [...(node.results ?? []), ...(node.effects ?? [])]
    const context: Context = {
        learned: learnedIds,
        bonuses: resolveConstellationBonuses(learnedIds),
    }
    appendActiveEffects(effects, node.activationAbilityId, context)
    return effects.length > 0 ? [...new Set(effects)] : undefined
}
function appendActiveEffects(
    effects: string[],
    ability: string | undefined,
    context: Context
): void {
    switch (ability) {
        case 'pray':
            appendHealingPrayer(effects, context, false)
            break
        case 'pray_woven':
            effects.push(
                'Лечит вас или союзника.',
                'Очищает могилы от тёмных сил.'
            )
            appendHealingPrayer(effects, context, true)
            break
        case 'pray_grave':
            if (context.learned.has('prayer_grave.revive')) {
                effects.push(
                    'Возвращает павших товарищей из числа нежити, чья душа ещё не покинула этот мир.'
                )
            }
            break
        case 'pray_road':
            appendDescription(effects, context.learned, 'prayer_road.walk')
            appendDescription(effects, context.learned, 'prayer_road.shoulder')
            appendDescription(effects, context.learned, 'prayer_road.bard')
            break
        case 'pray_lantern':
            break
        case 'shot':
            appendShot(effects, context)
            break
        case 'fireball':
        case 'greater_fireball':
            appendFireball(effects, context)
            break
        default:
            throw new Error(
                `Missing active card effects: ${ability ?? 'undefined'}`
            )
    }
}
function appendHealingPrayer(
    effects: string[],
    { learned, bonuses: b }: Context,
    woven: boolean
): void {
    if (woven) {
        effects.push(
            `Одновременно совершает разные чудеса: не более ${String(b.targetLimit)} целей за молитву.`
        )
    } else if (b.targetLimit > 1) {
        effects.push(
            `За одну молитву совершает один вид чуда: не более ${String(b.targetLimit)} целей.`
        )
    } else {
        effects.push('За одну молитву действует на одну выбранную цель.')
    }
    if (learned.has('prayer.revive')) {
        effects.push(
            'Воскрешает павших товарищей, душа которых ещё не ушла в мир иной.'
        )
        appendRevivalEffects(effects, learned)
    }
    if (learned.has('prayer.harm')) {
        effects.push('Наносит урон нежити в радиусе молитвы.')
        if (b.prayerHarmMultiplier > 1) {
            effects.push(
                `Урон кары увеличен на ${percent(b.prayerHarmMultiplier - 1)}%.`
            )
        }
    }
    if (b.prayerRadiusCells > 0) {
        effects.push(
            `Радиус молитвы увеличен на ${cells(b.prayerRadiusCells)}.`
        )
    }
    if (b.prayerDurationMultiplier < 1) {
        effects.push(
            `Молитва совершается на ${percent(1 - b.prayerDurationMultiplier)}% быстрее.`
        )
    }
    if (b.prayerGiftMultiplier > 1) {
        effects.push(
            `Лечение усилено на ${percent(b.prayerGiftMultiplier - 1)}%.`
        )
    }
    appendDescription(effects, learned, 'prayer.last_light')
    appendPrayerPassiveCapabilities(effects, learned, b)
    appendDivineKnowledge(effects, b.deityInsight, false)
    appendDivineKnowledge(effects, b.otherDeityInsight, true)
}
function appendPrayerPassiveCapabilities(
    effects: string[],
    learned: ReadonlySet<string>,
    b: Bonuses
): void {
    if (b.prayerConcentrationChance > 0) {
        effects.push(
            b.prayerAbsoluteConcentration
                ? 'Удары больше не прерывают молитву.'
                : 'Удар с вероятностью 50% не прерывает молитву.'
        )
    }
    for (let rank = 1; rank <= b.prayerWardRank; rank += 1) {
        appendDescription(effects, learned, `prayer.ward${String(rank)}`)
    }
    for (const id of [
        'prayer.aura_protection',
        'prayer.aura_blessing',
        'prayer.aura_domain',
    ]) {
        appendDescription(effects, learned, id)
    }
    if (b.prayerMartyr) {
        effects.push(
            'Максимальное базовое здоровье уменьшено на 30%, максимальная базовая мана — на 15%.'
        )
    }
}
function appendRevivalEffects(
    effects: string[],
    learned: ReadonlySet<string>
): void {
    const parameters = resolveResurrectionParameters('pray', learned, 'neutral')
    if (
        learned.has('prayer.revive_higher') ||
        learned.has('prayer.revive_stable')
    ) {
        effects.push(
            `Воскрешение возвращает не менее ${percent(parameters.hpFraction)}% HP.`
        )
    }
    const bonus = parameters.successChance - prayerAnswerChance('neutral')
    if (bonus > 0) {
        effects.push(
            `Шанс воскрешения повышен на ${percent(bonus)} процентных пунктов, но не выше 95%.`
        )
    }
    if (parameters.angelicChance > 0) {
        effects.push(
            `После успешного воскрешения с вероятностью ${percent(parameters.angelicChance)}% возвращает по 150% здоровья, маны и энергии.`
        )
    }
}
function appendDivineKnowledge(
    effects: string[],
    rank: number,
    others: boolean
): void {
    if (rank === 0) {
        return
    }
    const subject = others ? 'других богов' : 'Угольной Матери'
    const information = [
        `Позволяет замечать намёки на настроение ${subject}.`,
        `Раскрывает настроение ${subject}.`,
        `Раскрывает настроение и вероятность ответа ${subject}.`,
        `Раскрывает настроение, вероятность ответа и время смены настроения ${subject}.`,
    ]
    const known = information[rank - 1]
    if (known !== undefined) {
        effects.push(known)
    }
}
function appendShot(effects: string[], { learned, bonuses: b }: Context): void {
    if (b.shotDamageMultiplier > 1) {
        effects.push(
            `Урон Выстрела увеличен на ${percent(b.shotDamageMultiplier - 1)}%.`
        )
    }
    if (b.shotRangeCells > 0) {
        effects.push(
            `Дальность Выстрела увеличена на ${cells(b.shotRangeCells)}.`
        )
    }
    if (b.shotEnergyDiscount > 0) {
        effects.push(
            `Выстрел расходует на ${number(b.shotEnergyDiscount)} EN меньше.`
        )
    }
    if (b.shotTempoMultiplier < 1) {
        effects.push(
            `Интервал между Выстрелами сокращён на ${percent(1 - b.shotTempoMultiplier)}%.`
        )
    }
    if (b.shotCritBonus > 0) {
        effects.push(
            `Критический шанс Выстрела увеличен на ${percent(b.shotCritBonus)} процентных пункта.`
        )
    }
    appendDescription(
        effects,
        learned,
        learned.has('arrow.insight2') ? 'arrow.insight2' : 'arrow.insight1'
    )
    if (learned.has('magic.runic_echo')) {
        effects.push(
            'После полезного боевого заклинания следующий Выстрел на 10% сильнее в течение 5 секунд.'
        )
    }
}
function appendFireball(
    effects: string[],
    { learned, bonuses: b }: Context
): void {
    if (b.fireDamageMultiplier > 1) {
        effects.push(
            `Урон огненных шаров увеличен на ${percent(b.fireDamageMultiplier - 1)}%.`
        )
    }
    appendDescription(effects, learned, 'magic.insight')
    if (learned.has('magic.runic_echo')) {
        effects.push(
            'Полезное попадание создаёт рунический заряд: следующий Выстрел на 10% сильнее в течение 5 секунд.'
        )
    }
}
function appendDescription(
    effects: string[],
    learned: ReadonlySet<string>,
    id: string
): void {
    const description = nodes.get(id)?.description
    if (learned.has(id) && description !== undefined) {
        effects.push(...(nodes.get(id)?.results ?? [description]))
    }
}
