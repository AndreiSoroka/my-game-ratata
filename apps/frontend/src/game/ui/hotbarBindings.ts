import {
    type AbilityId,
    type CharacterAutoAction,
    type CharacterSnapshot,
    gravePurifyCastMs,
    isPrayerAction,
    type PrayerPreview,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'

export type HotbarBinding =
    | { kind: 'attack' }
    | { kind: 'ability'; id: AbilityId }
    | { kind: 'item'; id: 'food' | 'sapling' }
export function defaultHotbarBindings(player: CharacterSnapshot): (HotbarBinding | null)[] {
    const ability = { vanguard: undefined, ranger: 'shot', arcanist: 'spark', cleric: 'pray' }[
        player.heroClass ?? 'vanguard'
    ]
    return [
        { kind: 'attack' },
        ability ? { kind: 'ability', id: ability as AbilityId } : null,
        null,
        null,
    ]
}
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

export const hotbarGlyphs: Record<AbilityId, string> = {
    wide_swing: '◔',
    circular_swing: '◌',
    lunge: '➜',
    pommel_strike: '⚒',
    defensive_stance: '⛨',
    pray: '✦',
    pray_woven: '✥',
    pray_road: '➤',
    pray_lantern: '✧',
    pray_grave: '☾',
    spark: 'ϟ',
    barrier: '◇',
    shot: '➶',
    skeleton_strike: '⚒',
    fireball: '●',
    greater_fireball: '◉',
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
        preview.durationMs ? `${preview.durationMs / 1000} с` : '',
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
            ? `Ауры молитвы · ${preview.manaCost} MP · ${(preview.durationMs ?? 3000) / 1000} с`
            : `Помолиться · ${preview.manaCost} MP · Без эффекта`
    if (mode === 'purify_grave')
        return `Упокоить могилу · ${cost} · ${(preview.durationMs ?? gravePurifyCastMs(grave?.phase ?? 'active')) / 1000} с${player.abilities?.casting?.uninterruptible ? '' : ' · Esc — прервать'}`
    return undefined
}

function prayerPrice(preview: PrayerPreview): string {
    if (preview.cost?.healingManaFraction)
        return `${Math.round(preview.cost.healingManaFraction * 100)}% максимальной MP за лечение; ${preview.cost.manaPerTarget} MP за другое чудо`
    return `${preview.manaCost} MP${preview.abilityId === 'pray_woven' ? ' за цель' : ''}`
}

function prayerGift(
    intent: PrayerPreview['intent'],
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): string {
    const name =
        characters.find((actor) => actor.id === intent?.targetId)?.nickname ?? player.nickname
    const verbs = {
        revive: 'Воскресить',
        harm: 'Карающая волна',
        ward: 'Сдержать нежить',
        restore: 'Восстановить',
        devotion: 'Помолиться',
        purify_grave: 'Упокоить могилу',
    }
    const mode = intent?.mode ?? 'restore'
    const verb = verbs[mode]
    return mode === 'harm' || mode === 'ward' ? verb : `${verb} ${name}`
}

function collateralDescription(preview: PrayerPreview): string {
    return preview.harmfulTargets > 0
        ? [
              `Волна: ${preview.harmfulTargets} целей`,
              preview.includesAllies ? 'включая союзников' : '',
              preview.includesSelf ? 'включая вас' : '',
          ]
              .filter(Boolean)
              .join(', ')
        : ''
}
