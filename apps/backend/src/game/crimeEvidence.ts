import {
    THEFT_RULES,
    type TheftAccusation,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface CrimeProof extends TheftAccusation {
    locationId: string
    position: Vector2
    callUntil: number
    called: boolean
}

export class CrimeEvidence {
    private readonly records = new Map<string, Map<string, CrimeProof>>()

    public record(
        thief: GameCharacter,
        victim: GameCharacter,
        now: number
    ): void {
        const proofs =
            this.records.get(victim.id) ?? new Map<string, CrimeProof>()
        proofs.set(thief.id, {
            thiefId: thief.id,
            thiefName: thief.nickname,
            expiresAt: now + THEFT_RULES.evidenceMs,
            callUntil: now + THEFT_RULES.accusationMs,
            canCallGuards: true,
            reported: false,
            called: false,
            locationId: victim.locationId,
            position: { ...thief.position },
        })
        this.records.set(victim.id, proofs)
    }

    public get(victimId: string, thiefId: string): CrimeProof | undefined {
        return this.records.get(victimId)?.get(thiefId)
    }

    public snapshot(victimId: string, now: number): TheftAccusation[] {
        return [...(this.records.get(victimId)?.values() ?? [])]
            .filter((proof) => proof.expiresAt > now)
            .map((proof) => ({
                thiefId: proof.thiefId,
                thiefName: proof.thiefName,
                expiresAt: proof.expiresAt,
                reported: proof.reported,
                canCallGuards:
                    !proof.called && !proof.reported && proof.callUntil > now,
            }))
    }

    public forgetThief(thiefId: string): void {
        for (const proofs of this.records.values()) {
            proofs.delete(thiefId)
        }
    }

    public prune(
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): void {
        for (const [victimId, proofs] of this.records) {
            for (const [thiefId, proof] of proofs) {
                const thief = characters.get(thiefId)
                if (
                    proof.expiresAt <= now ||
                    thief === undefined ||
                    thief.tags.has('state.retired')
                ) {
                    proofs.delete(thiefId)
                }
            }
            if (proofs.size === 0 || !characters.has(victimId)) {
                this.records.delete(victimId)
            }
        }
    }
}
