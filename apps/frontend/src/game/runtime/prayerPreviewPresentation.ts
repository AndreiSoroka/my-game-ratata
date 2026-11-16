import {
    type CharacterSnapshot,
    type DeityPrayerProfile,
    type PrayerActionId,
    type PrayerPreview,
    profileForPrayer,
    snapshotPrayerParameters,
    type Vector2,
} from '@my-game-ratata/contracts'

export interface PrayerPreviewHighlight {
    abilityId?: PrayerActionId
    origin: Vector2
    radius: number
    targetId?: string
    warnings: Array<{ id: string; position: Vector2; self: boolean }>
}

/** Uses the hotbar's exact pinned preview and its already-visible character list. */
export function createPrayerPreviewHighlight(
    player: CharacterSnapshot,
    knownVisibleCharacters: readonly CharacterSnapshot[],
    preview: PrayerPreview,
    options: { active: boolean; canReach: (target: CharacterSnapshot) => boolean }
): PrayerPreviewHighlight | undefined {
    const profile = activeHarmProfile(player, preview, options.active)
    if (!profile || !preview.intent || preview.intent.mode === 'devotion') return undefined
    const known = [
        ...new Map([...knownVisibleCharacters, player].map((actor) => [actor.id, actor])).values(),
    ]
    const nearby = (target: CharacterSnapshot): boolean =>
        !target.tags.includes('offline') &&
        target.life?.retired !== true &&
        Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y) <=
            (preview.radius ??
                snapshotPrayerParameters(player, preview.abilityId ?? 'pray').radius) &&
        (target.id === player.id || options.canReach(target))
    const targetId = preview.intent.targetId
    if (targetId !== undefined && !known.some((target) => target.id === targetId && nearby(target)))
        return undefined
    return {
        abilityId: preview.abilityId ?? 'pray',
        origin: { ...player.position },
        radius:
            preview.radius ?? snapshotPrayerParameters(player, preview.abilityId ?? 'pray').radius,
        ...(targetId === undefined ? {} : { targetId }),
        warnings: known
            .filter(
                (target) =>
                    target.alive &&
                    (preview.harmfulTargetIds?.includes(target.id) ?? true) &&
                    nearby(target) &&
                    profile.harmTypes.includes(target.creatureType) &&
                    (target.id === player.id ||
                        (target.relationship ??
                            (target.faction === player.faction ? 'friendly' : 'hostile')) ===
                            'friendly')
            )
            .map((target) => ({
                id: target.id,
                position: { ...target.position },
                self: target.id === player.id,
            })),
    }
}

function activeHarmProfile(
    player: CharacterSnapshot,
    preview: PrayerPreview,
    active: boolean
): DeityPrayerProfile | undefined {
    if (
        !active ||
        !player.alive ||
        preview.harmfulTargets <= 0 ||
        player.tags.includes('offline') ||
        preview.unavailableReason !== null
    )
        return undefined
    const abilityId = preview.abilityId ?? 'pray'
    const profile = profileForPrayer(abilityId)
    return snapshotPrayerParameters(player, abilityId).harm === true && profile.harmTypes.length > 0
        ? profile
        : undefined
}
