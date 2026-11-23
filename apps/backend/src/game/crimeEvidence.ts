import {
    THEFT_RULES,
    type TheftAccusation,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface CrimeProof extends TheftAccusation {
    offense: CrimeOffense
    locationId: string
    position: Vector2
    callUntil: number
    called: boolean
}

export type CrimeOffense = NonNullable<TheftAccusation['offense']>

export class CrimeEvidence {
    private readonly records = new Map<string, Map<string, CrimeProof>>()

    public record(
        thief: GameCharacter,
        victim: GameCharacter,
        now: number,
        offense: CrimeOffense = 'theft'
    ): void {
        const proofs =
            this.records.get(victim.id) ?? new Map<string, CrimeProof>()
        proofs.set(proofKey(thief.id, offense), {
            offense,
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

    public get(
        victimId: string,
        thiefId: string,
        offense: CrimeOffense = 'theft'
    ): CrimeProof | undefined {
        return this.records.get(victimId)?.get(proofKey(thiefId, offense))
    }

    public reportable(
        victimId: string,
        offenderId: string,
        now: number,
        offense?: CrimeOffense
    ): CrimeProof | undefined {
        const preferred = unreportedProof(
            this.get(victimId, offenderId, offense ?? 'theft'),
            now
        )
        return offense === undefined
            ? (preferred ??
                  unreportedProof(
                      this.get(victimId, offenderId, 'attack'),
                      now
                  ))
            : preferred
    }

    public snapshot(victimId: string, now: number): TheftAccusation[] {
        const accusations = new Map<string, CrimeProof>()
        for (const proof of this.records.get(victimId)?.values() ?? []) {
            if (proof.expiresAt > now && !accusations.has(proof.thiefId)) {
                accusations.set(
                    proof.thiefId,
                    this.reportable(victimId, proof.thiefId, now) ?? proof
                )
            }
        }
        return [...accusations.values()].map((proof) => ({
            thiefId: proof.thiefId,
            thiefName: proof.thiefName,
            ...(proof.offense === 'attack' ? { offense: proof.offense } : {}),
            expiresAt: proof.expiresAt,
            reported: proof.reported,
            canCallGuards:
                proof.offense === 'theft' &&
                !proof.called &&
                !proof.reported &&
                proof.callUntil > now,
        }))
    }

    public forgetThief(thiefId: string): void {
        for (const proofs of this.records.values()) {
            proofs.delete(proofKey(thiefId, 'theft'))
            proofs.delete(proofKey(thiefId, 'attack'))
        }
    }

    public prune(
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): void {
        for (const [victimId, proofs] of this.records) {
            for (const [key, proof] of proofs) {
                const thief = characters.get(proof.thiefId)
                if (
                    proof.expiresAt <= now ||
                    thief === undefined ||
                    thief.tags.has('state.retired')
                ) {
                    proofs.delete(key)
                }
            }
            if (proofs.size === 0 || !characters.has(victimId)) {
                this.records.delete(victimId)
            }
        }
    }
}

function unreportedProof(
    proof: CrimeProof | undefined,
    now: number
): CrimeProof | undefined {
    return proof?.reported === false && proof.expiresAt > now
        ? proof
        : undefined
}

function proofKey(id: string, offense: CrimeOffense): string {
    return `${offense}:${id}`
}
