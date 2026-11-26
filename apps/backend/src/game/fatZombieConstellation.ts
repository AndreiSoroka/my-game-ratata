import { livingCreatureTypes } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationRandom } from './constellationRandom'
import { fatZombieStars } from './fatZombieStars'

const rootId = 'fat_zombie.root'
const starCount = 1 + fatZombieStars.length
interface FatZombieProgress {
    random: () => number
    deaths: Map<string, number>
}

const progress = new WeakMap<GameCharacter, FatZombieProgress>()

export function initializeFatZombieConstellation(
    actor: GameCharacter,
    worldSeed: string,
    floor: number
): void {
    if (actor.archetype !== 'fat_zombie' || floor < 2 || progress.has(actor)) {
        return
    }
    const random = constellationRandom(`${worldSeed}:${actor.id}:heavy-flesh`)
    const startingStars = 5 + Math.floor(random() * 3) + 2 * (floor - 2)
    const { opened } = actor.progression.constellations
    opened.add(rootId)
    for (let count = 1; count < startingStars; count += 1) {
        openNextStar(opened, random)
    }
    progress.set(actor, { random, deaths: new Map() })
}

/** Only the resolved lethal hit calls this, so a replay cannot spend another opening on that death. */
export function creditFatZombieKill(
    actor: GameCharacter,
    victim: GameCharacter
): void {
    const state = progress.get(actor)
    if (
        state === undefined ||
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired') ||
        actor.locationId !== victim.locationId ||
        victim.alive ||
        !livingCreatureTypes.includes(victim.creatureType) ||
        (state.deaths.get(victim.id) ?? 0) >= victim.deathSequence
    ) {
        return
    }
    const { opened } = actor.progression.constellations
    if (fatZombieStars.every(({ id }) => opened.has(id))) {
        return
    }
    state.deaths.set(victim.id, victim.deathSequence)
    openNextStar(opened, state.random)
}

function openNextStar(opened: Set<string>, random: () => number): void {
    const frontier = fatZombieStars.filter(
        ({ id, parents }) =>
            !opened.has(id) && parents.every((parent) => opened.has(parent))
    )
    const selected = frontier[Math.floor(random() * frontier.length)]
    if (selected !== undefined) {
        opened.add(selected.id)
    }
}

export const fatZombieConstellationSize = starCount
