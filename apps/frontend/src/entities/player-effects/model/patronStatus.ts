import {
    type CharacterSnapshot,
    type DeityId,
    type DeityMood,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
} from '@my-game-ratata/contracts'

export interface PatronStatusEntry {
    id: DeityId
    name: string
    level?: number | undefined
    mood?: DeityMood | undefined
}

export function projectPlayerPatrons({
    progression,
    abilities,
}: Pick<CharacterSnapshot, 'progression' | 'abilities'>): PatronStatusEntry[] {
    const patron = progression?.deity
    if (!patron) return []

    const prayer = prayerAbilityForDeity(patron.id)
    if (!abilities?.known.includes(prayer)) return []

    const mastery = progression.masteries.find(
        (entry) => entry.id === PRAYER_SCHOOL_DEFINITIONS[prayer].constellationId
    )
    return [
        { id: patron.id, name: patron.name, level: mastery?.level, mood: patron.mood ?? undefined },
    ]
}
