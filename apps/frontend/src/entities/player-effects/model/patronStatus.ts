import {
    type CharacterSnapshot,
    type DeityId,
    type DeityMood,
    type DeitySnapshot,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
} from '@my-game-ratata/contracts'
import { computed, reactive, readonly, watch } from 'vue'

import { tGame, tLocalized } from '@/shared/lib/i18n'

export interface PatronPrayerChances {
    healing: number
    purificationPerStep: number
    resurrection: number | null
}

export interface PatronStatusEntry {
    id: DeityId
    name: string
    level?: number | undefined
    mood?: DeityMood | undefined
    omen?: string | undefined
    prayerChances?: PatronPrayerChances | undefined
    changesInMs?: number | undefined
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
        {
            id: patron.id,
            name: tGame(`game.deity.${patron.id}`),
            level: mastery?.level,
            mood: patron.mood ?? undefined,
            ...(patron.id === 'hearth' && hearthPatronDetails(patron)),
        },
    ]
}

function hearthPatronDetails(patron: DeitySnapshot) {
    const { omen, perception, successChance, hearthPrayerChances, changesInMs } = patron
    return {
        omen: perception === 'vague' ? undefined : tLocalized(patron.omenMessage, omen),
        prayerChances:
            hearthPrayerChances && successChance !== null
                ? { ...hearthPrayerChances, healing: successChance }
                : undefined,
        changesInMs: changesInMs ?? undefined,
    }
}

export function createPatronStatusStore(getPatrons: () => readonly PatronStatusEntry[]) {
    const sortedPatrons = computed(() =>
        getPatrons()
            .filter((patron) => patron.name.trim())
            .sort((left, right) => (right.level ?? 0) - (left.level ?? 0))
    )
    const moodChanges = reactive(new Map<DeityId, number>())

    watch(
        () => sortedPatrons.value.map(({ id, omen }) => [id, omen] as const),
        (omens, previousOmens) => {
            const current = new Map(omens)
            for (const [id, previousOmen] of previousOmens) {
                const omen = current.get(id)
                if (!omen) {
                    moodChanges.delete(id)
                } else if (previousOmen && previousOmen !== omen) {
                    moodChanges.set(id, (moodChanges.get(id) ?? 0) + 1)
                }
            }
        }
    )
    return { sortedPatrons, moodChanges: readonly(moodChanges) }
}
