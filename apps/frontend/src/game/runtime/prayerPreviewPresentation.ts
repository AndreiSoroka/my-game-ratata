import {
    type CharacterSnapshot,
    DEITY_PRAYER_PROFILES,
    type DeityPrayerProfile,
    PRAYER_RULES,
    type PrayerPreview,
    type Vector2,
} from '@my-game-ratata/contracts'

export interface PrayerPreviewHighlight {
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
    if (!profile || !preview.intent) return undefined
    const known = [
        ...new Map([...knownVisibleCharacters, player].map((actor) => [actor.id, actor])).values(),
    ]
    const nearby = (target: CharacterSnapshot): boolean =>
        !target.tags.includes('offline') &&
        target.life?.retired !== true &&
        Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y) <=
            PRAYER_RULES.radius &&
        (target.id === player.id || options.canReach(target))
    const targetId = preview.intent.targetId
    if (targetId !== undefined && !known.some((target) => target.id === targetId && nearby(target)))
        return undefined
    return {
        origin: { ...player.position },
        radius: PRAYER_RULES.radius,
        ...(targetId === undefined ? {} : { targetId }),
        warnings: known
            .filter(
                (target) =>
                    target.alive &&
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
        player.tags.includes('offline') ||
        preview.unavailableReason !== null
    )
        return undefined
    const level = player.progression?.skills.find((skill) => skill.id === 'miracles')?.level ?? 1
    const profile = DEITY_PRAYER_PROFILES[player.progression?.deity.id ?? 'hearth']
    return level >= PRAYER_RULES.harmLevel && profile.harmTypes.length > 0 ? profile : undefined
}
