import type { AbilityId, CharacterSnapshot, PrayerPreview } from '@my-game-ratata/contracts'

export type HotbarBinding = { kind: 'ability'; id: AbilityId } | { kind: 'item'; id: 'food' }
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
    player: CharacterSnapshot
): string {
    if (preview.unavailableReason) return preview.unavailableReason
    const intent = preview.intent
    const name =
        characters.find((actor) => actor.id === intent?.targetId)?.nickname ?? player.nickname
    const verb =
        intent?.mode === 'revive'
            ? 'Воскресить'
            : intent?.mode === 'harm'
              ? 'Карающая волна'
              : 'Восстановить'
    const gift = intent?.mode === 'harm' ? verb : `${verb} ${name}`
    return [`${gift} · ${preview.manaCost} MP`, collateralDescription(preview)]
        .filter(Boolean)
        .join(' · ')
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
