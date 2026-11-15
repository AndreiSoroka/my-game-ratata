import {
    type AbilityId,
    type CharacterAutoAction,
    type CharacterSnapshot,
    gravePurifyCastMs,
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
        ? binding.id === 'pray'
        : action.kind === 'ability' && binding.id === action.abilityId
}

export const hotbarGlyphs: Record<AbilityId, string> = {
    pray: '✦',
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
    if (intent?.mode === 'devotion') return `Помолиться · ${preview.manaCost} MP · Без эффекта`
    if (intent?.mode === 'purify_grave')
        return `Упокоить могилу · ${preview.manaCost} MP · ${(preview.durationMs ?? gravePurifyCastMs(grave?.phase ?? 'active')) / 1000} с · Esc — прервать`
    const gift = prayerGift(intent, characters, player)
    return [
        `${gift} · ${preview.manaCost} MP`,
        preview.durationMs ? `${preview.durationMs / 1000} с` : '',
        collateralDescription(preview),
    ]
        .filter(Boolean)
        .join(' · ')
}

function prayerGift(
    intent: PrayerPreview['intent'],
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): string {
    const name =
        characters.find((actor) => actor.id === intent?.targetId)?.nickname ?? player.nickname
    const verb =
        intent?.mode === 'revive'
            ? 'Воскресить'
            : intent?.mode === 'harm'
              ? 'Карающая волна'
              : 'Восстановить'
    return intent?.mode === 'harm' ? verb : `${verb} ${name}`
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
