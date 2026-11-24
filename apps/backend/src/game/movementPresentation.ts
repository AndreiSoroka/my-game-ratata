import type {
    CharacterSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

/** Only the current simulation step owns these deadlines; no character state is stored. */
export function projectMovementPresentation(
    snapshot: WorldSnapshot,
    deadlines: ReadonlyMap<string, number>
): WorldSnapshot {
    return {
        ...snapshot,
        characters: snapshot.characters.map((character) =>
            projectCharacterMotion(character, deadlines.get(character.id))
        ),
    }
}

function projectCharacterMotion(
    character: CharacterSnapshot,
    deadline: number | undefined
): CharacterSnapshot {
    if (character.movement === undefined) {
        return character
    }
    const moving = Math.hypot(character.velocity.x, character.velocity.y) > 0
    const allowed =
        character.alive &&
        !character.tags.includes('offline') &&
        character.cooldowns.stunMsLeft <= 0 &&
        character.combat?.defensiveStance !== true
    const continuationUntil = moving && allowed ? deadline : undefined
    if (
        continuationUntil === undefined &&
        character.movement.continuationUntil === undefined
    ) {
        return character
    }
    const movement = { ...character.movement }
    delete movement.continuationUntil
    if (continuationUntil !== undefined) {
        movement.continuationUntil = continuationUntil
    }
    return { ...character, movement }
}
