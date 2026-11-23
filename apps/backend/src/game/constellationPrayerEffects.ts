import {
    resolveAshParameters,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { resolveConstellationBonuses } from './constellationBonuses'
import {
    appendLearnedEffect,
    type EffectRow,
    effectRow,
} from './constellationEffectText'
import { prayerAnswerChance } from './prayerProbability'

type Bonuses = ReturnType<typeof resolveConstellationBonuses>
interface Context {
    learned: ReadonlySet<string>
    bonuses: Bonuses
}
const numberFormat = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
})
const englishFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const percent = (value: number) => numberFormat.format(value * 100)
const englishPercent = (value: number) => englishFormat.format(value * 100)
const cells = (value: number) =>
    `${String(value)} ${value === 1 ? 'клетку' : 'клетки'}`
const tiles = (value: number) =>
    `${String(value)} ${value === 1 ? 'tile' : 'tiles'}`

export function appendAshPrayer(
    effects: EffectRow[],
    learned: ReadonlySet<string>
): void {
    const ash = resolveAshParameters(learned)
    if (learned.has('prayer_grave.revive')) {
        effects.push(
            effectRow(
                'Возвращает павших товарищей из числа нежити, чья душа ещё не покинула этот мир.',
                'Revives fallen undead allies whose souls have yet to leave this world.'
            )
        )
    }
    if (ash.healPower > 1) {
        effects.push(
            effectRow(
                `Лечение усилено на ${percent(ash.healPower - 1)}%.`,
                `Healing increases by ${englishPercent(ash.healPower - 1)}%.`
            )
        )
    }
    if (ash.healChanceBonus > 0) {
        effects.push(
            effectRow(
                `Шанс исцеления выше на ${percent(ash.healChanceBonus)} п.п.`,
                `Healing chance increases by ${englishPercent(ash.healChanceBonus)} percentage points.`
            )
        )
    }
    if (ash.healRadiusCells > 0) {
        effects.push(
            effectRow(
                `Радиус исцеления больше на ${cells(ash.healRadiusCells)}.`,
                `Healing radius increases by ${tiles(ash.healRadiusCells)}.`
            )
        )
    }
    for (const id of ['brand', 'heal_walk', 'heal_second', 'dash', 'mana']) {
        appendLearnedEffect(effects, learned, `prayer_grave.${id}`)
    }
}
export function appendHealingPrayer(
    effects: EffectRow[],
    { learned, bonuses: b }: Context,
    woven: boolean
): void {
    if (woven) {
        effects.push(
            effectRow(
                `Одновременно совершает разные чудеса: не более ${String(b.targetLimit)} целей за молитву.`,
                `Performs different miracles at once, on up to ${String(b.targetLimit)} targets per prayer.`
            )
        )
    } else if (b.targetLimit > 1) {
        effects.push(
            effectRow(
                `За одну молитву совершает один вид чуда: не более ${String(b.targetLimit)} целей.`,
                `Performs one kind of miracle per prayer, on up to ${String(b.targetLimit)} targets.`
            )
        )
    } else {
        effects.push(
            effectRow(
                'За одну молитву действует на одну выбранную цель.',
                'Each prayer affects one selected target.'
            )
        )
    }
    appendRevivalEffects(effects, learned)
    if (learned.has('prayer.harm')) {
        effects.push(
            effectRow(
                'Наносит урон нежити в радиусе молитвы.',
                'Damages undead within the prayer radius.'
            )
        )
        if (b.prayerHarmMultiplier > 1) {
            effects.push(
                effectRow(
                    `Урон кары увеличен на ${percent(b.prayerHarmMultiplier - 1)}%.`,
                    `Smite damage increases by ${englishPercent(b.prayerHarmMultiplier - 1)}%.`
                )
            )
        }
    }
    if (b.prayerRadiusCells > 0) {
        effects.push(
            effectRow(
                `Радиус молитвы увеличен на ${cells(b.prayerRadiusCells)}.`,
                `Prayer radius increases by ${tiles(b.prayerRadiusCells)}.`
            )
        )
    }
    if (b.prayerDurationMultiplier < 1) {
        effects.push(
            effectRow(
                `Молитва совершается на ${percent(1 - b.prayerDurationMultiplier)}% быстрее.`,
                `The prayer is ${englishPercent(1 - b.prayerDurationMultiplier)}% faster.`
            )
        )
    }
    if (b.prayerGiftMultiplier > 1) {
        effects.push(
            effectRow(
                `Лечение усилено на ${percent(b.prayerGiftMultiplier - 1)}%.`,
                `Healing increases by ${englishPercent(b.prayerGiftMultiplier - 1)}%.`
            )
        )
    }
    appendLearnedEffect(effects, learned, 'prayer.last_light')
    appendPrayerPassiveCapabilities(effects, learned, b)
    appendDivineKnowledge(effects, b.deityInsight, false)
    appendDivineKnowledge(effects, b.otherDeityInsight, true)
}
function appendPrayerPassiveCapabilities(
    effects: EffectRow[],
    learned: ReadonlySet<string>,
    b: Bonuses
): void {
    if (b.prayerConcentrationChance > 0) {
        effects.push(
            b.prayerAbsoluteConcentration
                ? effectRow(
                      'Удары больше не прерывают молитву.',
                      'Hits no longer interrupt the prayer.'
                  )
                : effectRow(
                      'Удар с вероятностью 50% не прерывает молитву.',
                      'A hit has a 50% chance to leave the prayer uninterrupted.'
                  )
        )
    }
    for (let rank = 1; rank <= b.prayerWardRank; rank += 1) {
        appendLearnedEffect(effects, learned, `prayer.ward${String(rank)}`)
    }
    for (const id of [
        'prayer.aura_protection',
        'prayer.aura_blessing',
        'prayer.aura_domain',
    ]) {
        appendLearnedEffect(effects, learned, id)
    }
    if (b.prayerMartyr) {
        effects.push(
            effectRow(
                'Максимальное базовое здоровье уменьшено на 30%, максимальная базовая мана — на 15%.',
                'Base maximum health decreases by 30% and base maximum mana by 15%.'
            )
        )
    }
}
function appendRevivalEffects(
    effects: EffectRow[],
    learned: ReadonlySet<string>
): void {
    if (!learned.has('prayer.revive')) {
        return
    }
    effects.push(
        effectRow(
            'Воскрешает павших товарищей, душа которых ещё не ушла в мир иной.',
            'Resurrects fallen allies whose souls have yet to pass on.'
        )
    )
    const parameters = resolveResurrectionParameters('pray', learned, 'neutral')
    if (
        learned.has('prayer.revive_higher') ||
        learned.has('prayer.revive_stable')
    ) {
        effects.push(
            effectRow(
                `Воскрешение возвращает не менее ${percent(parameters.hpFraction)}% HP.`,
                `Resurrection restores at least ${englishPercent(parameters.hpFraction)}% HP.`
            )
        )
    }
    const bonus = parameters.successChance - prayerAnswerChance('neutral')
    if (bonus > 0) {
        effects.push(
            effectRow(
                `Шанс воскрешения повышен на ${percent(bonus)} процентных пунктов, но не выше 95%.`,
                `Resurrection chance increases by ${englishPercent(bonus)} percentage points, up to 95%.`
            )
        )
    }
    if (parameters.angelicChance > 0) {
        effects.push(
            effectRow(
                `После успешного воскрешения с вероятностью ${percent(parameters.angelicChance)}% возвращает по 150% здоровья, маны и энергии.`,
                `After a successful resurrection, there is a ${englishPercent(parameters.angelicChance)}% chance to restore 150% each of health, mana and energy.`
            )
        )
    }
}
function appendDivineKnowledge(
    effects: EffectRow[],
    rank: number,
    others: boolean
): void {
    if (rank === 0) {
        return
    }
    const subject = others ? 'других богов' : 'Угольной Матери'
    const englishSubject = others ? 'other gods' : 'the Coal Mother'
    const information = [
        effectRow(
            `Позволяет замечать намёки на настроение ${subject}.`,
            `You notice hints about the mood of ${englishSubject}.`
        ),
        effectRow(
            `Раскрывает настроение ${subject}.`,
            `Reveals the mood of ${englishSubject}.`
        ),
        effectRow(
            `Раскрывает настроение и вероятность ответа ${subject}.`,
            `Reveals the mood and chance of a response from ${englishSubject}.`
        ),
        effectRow(
            `Раскрывает настроение, вероятность ответа и время смены настроения ${subject}.`,
            `Reveals the mood of ${englishSubject}, the chance of a response and the time until their mood changes.`
        ),
    ]
    const known = information[rank - 1]
    if (known !== undefined) {
        effects.push(known)
    }
}
