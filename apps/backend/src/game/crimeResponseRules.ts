import type { GameCharacter } from './character'
import type { CrimeProof } from './crimeEvidence'
import type { CrimeResponse } from './crimeResponses'
import { available, humanControlled } from './crimeRules'
import { canTargetByFaction } from './factions'

export function validAccusation(
    actor: GameCharacter,
    thief: GameCharacter | undefined,
    proof: CrimeProof | undefined,
    now: number
): thief is GameCharacter {
    return (
        available(actor) &&
        actor.soul.canSpeak &&
        available(thief) &&
        proof !== undefined &&
        proof.callUntil > now &&
        !proof.reported &&
        actor.locationId === proof.locationId &&
        thief.locationId === actor.locationId
    )
}
export function activeResponse(
    actor: GameCharacter | undefined,
    thief: GameCharacter | undefined,
    response: CrimeResponse,
    now: number
): actor is GameCharacter {
    return (
        available(actor) &&
        !humanControlled(actor) &&
        available(thief) &&
        now < response.until &&
        canTargetByFaction(actor, thief, now) &&
        (response.mode === 'fight' ||
            (actor.locationId === response.locationId &&
                thief.locationId === response.locationId))
    )
}
