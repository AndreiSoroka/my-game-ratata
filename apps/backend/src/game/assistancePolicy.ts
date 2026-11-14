import type { AssistancePolicy } from '@my-game-ratata/contracts'

export interface AssistanceFacts {
    met: boolean
    questCompleted: (questId: string) => boolean
}

/** Authored conditions are data, never executable NPC prose. */
export function evaluateAssistancePolicy(
    policy: AssistancePolicy,
    facts: AssistanceFacts,
    depth = 0
): boolean {
    if (depth > 16) {
        return false
    }
    switch (policy.kind) {
        case 'always':
            return true
        case 'never':
            return false
        case 'met':
            return facts.met
        case 'quest_completed':
            return facts.questCompleted(policy.questId)
        case 'all':
            return (
                policy.conditions.length > 0 &&
                policy.conditions.every((condition) =>
                    evaluateAssistancePolicy(condition, facts, depth + 1)
                )
            )
        case 'any':
            return policy.conditions.some((condition) =>
                evaluateAssistancePolicy(condition, facts, depth + 1)
            )
    }
}
