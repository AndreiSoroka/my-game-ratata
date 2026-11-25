import {
    type AbilityId,
    type CharacterAutoAction,
    type CharacterSnapshot,
    gravePurifyCastMs,
    isPrayerAction,
    type PrayerPreview,
    ROAD_PRAYER_RULES,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

export type HotbarBinding =
    | { kind: 'attack' }
    | { kind: 'ability'; id: AbilityId }
    | { kind: 'item'; id: 'food' | 'sapling' }
export function bindingMatchesAction(
    binding: HotbarBinding | null,
    action: CharacterAutoAction | undefined
): boolean {
    if (!binding || !action || binding.kind === 'item') return false
    if (binding.kind === 'attack') return action.kind === 'attack'
    return action.kind === 'prayer'
        ? isPrayerAction(binding.id) && binding.id === (action.abilityId ?? 'pray')
        : action.kind === 'ability' && binding.id === action.abilityId
}

export function prayerDescription(
    preview: PrayerPreview,
    characters: CharacterSnapshot[],
    player: CharacterSnapshot,
    grave?: WorldGraveSnapshot
): string {
    if (preview.unavailableReason) return preview.unavailableReason
    const intent = preview.intent
    const cost = prayerPrice(preview)
    const channel = prayerChannelDescription(preview, player, grave)
    if (channel !== undefined) return channel
    const gift = prayerGift(intent, characters, player)
    return [
        `${gift} · ${cost}`,
        preview.durationMs
            ? tGame('game.world.secondsValue', { seconds: preview.durationMs / 1000 })
            : '',
        preview.abilityId === 'pray_road'
            ? tGame('game.world.recoveryAura', {
                  multiplier: ROAD_PRAYER_RULES.energyRegenMultiplier,
              })
            : '',
        collateralDescription(preview),
    ]
        .filter(Boolean)
        .join(' · ')
}

function prayerChannelDescription(
    preview: PrayerPreview,
    player: CharacterSnapshot,
    grave?: WorldGraveSnapshot
): string | undefined {
    const mode = preview.intent?.mode
    const cost = prayerPrice(preview)
    if (mode === 'devotion')
        return preview.manaCost > 0
            ? tGame('game.world.prayerAuras', {
                  mana: preview.manaCost,
                  seconds: (preview.durationMs ?? 3000) / 1000,
              })
            : tGame('game.world.prayWithoutEffect', { mana: preview.manaCost })
    if (mode === 'purify_grave')
        return tGame('game.world.cleanseGrave', {
            cost,
            seconds: (preview.durationMs ?? gravePurifyCastMs(grave?.phase ?? 'active')) / 1000,
            cancel: player.abilities?.casting?.uninterruptible
                ? ''
                : tGame('game.world.interruptShortcut'),
        })
    return undefined
}

function prayerPrice(preview: PrayerPreview): string {
    if (preview.cost?.healingManaFraction)
        return tGame('game.world.mixedManaCost', {
            percent: Math.round(preview.cost.healingManaFraction * 100),
            mana: preview.cost.manaPerTarget,
        })
    return `${preview.manaCost} MP${preview.abilityId === 'pray_woven' ? tGame('game.world.perTarget') : ''}`
}

function prayerGift(
    intent: PrayerPreview['intent'],
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): string {
    const name =
        characters.find((actor) => actor.id === intent?.targetId)?.nickname ?? player.nickname
    const verbs = {
        revive: tGame('game.world.resurrect'),
        harm: tGame('game.world.punishingWave'),
        ward: tGame('game.world.repelUndead'),
        restore: tGame('game.world.recoverResources'),
        devotion: tGame('game.world.pray'),
        purify_grave: tGame('game.world.cleanseGraveAction'),
    }
    const mode = intent?.mode ?? 'restore'
    const verb = verbs[mode]
    return mode === 'harm' || mode === 'ward' ? verb : `${verb} ${name}`
}

function collateralDescription(preview: PrayerPreview): string {
    return preview.harmfulTargets > 0
        ? [
              tGame('game.world.targetsInWave', { count: preview.harmfulTargets }),
              preview.includesAllies ? tGame('game.world.includingAllies') : '',
              preview.includesSelf ? tGame('game.world.includingYou') : '',
          ]
              .filter(Boolean)
              .join(', ')
        : ''
}
