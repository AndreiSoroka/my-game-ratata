import type { CharacterArchetype } from '@my-game-ratata/contracts'

import { CharacterEmotions } from './characterEmotions'
import {
    createReactionProfile,
    pickWeightedReaction,
    type ReactionRequest,
    type ReactionResult,
    reactionRoll,
    reactionWeights,
} from './characterReactions'
import { generateCharacterTraits, temperamentRoll } from './characterTraits'

export class CharacterTemperament {
    public readonly traits: ReturnType<typeof generateCharacterTraits>
    public readonly emotions: CharacterEmotions
    public readonly reactionProfile: ReturnType<typeof createReactionProfile>
    private readonly decisions = new Map<
        string,
        Map<string | number, ReactionResult>
    >()

    public constructor(
        private readonly actorId: string,
        archetype: CharacterArchetype
    ) {
        this.traits = generateCharacterTraits(actorId, archetype)
        this.emotions = new CharacterEmotions(this.traits)
        this.reactionProfile = createReactionProfile(this.traits)
    }

    /** Matching receipts replay their original decision and never add another emotional impulse. */
    public react(
        request: ReactionRequest,
        now: number,
        random?: () => number
    ): ReactionResult {
        const { incidentId, trigger, sourceId, revision = 0 } = request
        const key = JSON.stringify([trigger, incidentId])
        const existing = this.decisions.get(key)
        const cached = existing?.get(revision)
        if (cached !== undefined) {
            return cached
        }
        const roll = reactionRoll(
            random?.() ??
                temperamentRoll(['reaction', this.actorId, key, revision])
        )
        const reason = Object.freeze({
            incidentId,
            trigger,
            ...(sourceId === undefined ? {} : { sourceId }),
        })
        if (existing === undefined) {
            this.emotions.observe(reason, request.severity ?? 50, now)
        }
        const weights = reactionWeights(
            this.reactionProfile,
            this.traits,
            this.emotions.snapshot(now),
            request
        )
        const result: ReactionResult = Object.freeze({
            action: pickWeightedReaction(weights, roll),
            weights,
            reason,
            roll,
        })
        const revisions = existing ?? new Map<string | number, ReactionResult>()
        revisions.set(revision, result)
        this.decisions.set(key, revisions)
        return result
    }
}
