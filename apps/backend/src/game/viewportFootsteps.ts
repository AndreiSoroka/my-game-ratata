import {
    type CharacterSnapshot,
    type FootstepSourceSnapshot,
    MOVEMENT_RULES,
} from '@my-game-ratata/contracts'

/** Preserve audible motion only from the observer's already authorized characters. */
export function viewportFootsteps(
    authorized: readonly CharacterSnapshot[],
    visible: readonly CharacterSnapshot[],
    playerId: string | undefined
): FootstepSourceSnapshot[] {
    const listener = authorized.find((character) => character.id === playerId)
    if (listener?.alive !== true) {
        return []
    }
    const rendered = new Set(visible.map((character) => character.id))
    return authorized
        .filter((character) => {
            const radius =
                MOVEMENT_RULES.playerFootstepHearingRadius *
                Math.sqrt(noiseMultiplier(character))
            return (
                !rendered.has(character.id) &&
                character.alive &&
                Math.hypot(
                    character.position.x - listener.position.x,
                    character.position.y - listener.position.y
                ) < radius
            )
        })
        .map(({ id, alive, position, velocity, archetype, movement }) => ({
            id,
            alive,
            position,
            velocity,
            archetype,
            ...(movement === undefined ? {} : { movement }),
        }))
}

function noiseMultiplier(character: CharacterSnapshot): number {
    if (character.movement?.dashing === true) {
        return MOVEMENT_RULES.dashNoiseMultiplier
    }
    return character.movement?.mode === 'sneaking'
        ? MOVEMENT_RULES.sneakNoiseMultiplier
        : 1
}
