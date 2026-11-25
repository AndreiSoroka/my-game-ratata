import {
    INVENTORY_CAPACITY,
    type ScenarioTrigger,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { snapshotControl } from './characterControl'
import { distance } from './math'
import type { GameRoom } from './room'
import { type ScenarioRuntime, startScenarioReaction } from './scenarioState'
import {
    findFriendlyScenarioTarget,
    visibleScenarioCharacter,
    visibleScenarioEnemy,
    visibleScenarioPlot,
} from './scenarioTargets'

/** Only actor-visible facts can select a reaction. One winner consumes the pass. */
export function selectScenarioReaction(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number
): boolean {
    if (run.reaction !== null || run.passStartedAt === undefined) {
        return false
    }
    for (const reaction of run.definition.reactions) {
        const armedAt = run.passStartedAt + (reaction.delayMs ?? 0)
        if (now < armedAt) {
            continue
        }
        const match = matchTrigger(
            actor,
            run,
            room,
            reaction.trigger,
            now,
            armedAt
        )
        if (match === false) {
            continue
        }
        const sequence = run.definition.sequences.find(
            (entry) => entry.id === reaction.sequenceId
        )
        if (sequence === undefined) {
            continue
        }
        startScenarioReaction(
            actor,
            run,
            {
                sequence,
                targetId: typeof match === 'string' ? match : undefined,
            },
            reaction.id
        )
        if (reaction.notification !== undefined) {
            publishReactionNotice(
                actor,
                run.snapshot.ownerId,
                room,
                reaction.notification,
                now
            )
        }
        return true
    }
    return false
}

function publishReactionNotice(
    actor: GameCharacter,
    ownerId: string,
    room: GameRoom,
    text: string,
    now: number
): void {
    const audienceIds = [actor.id]
    const owner = room.getCharacter(ownerId)
    if (
        owner !== undefined &&
        owner !== actor &&
        visibleScenarioCharacter(owner, room, now, actor.id) !== undefined
    ) {
        audienceIds.push(owner.id)
    }
    room.publishEvents([
        {
            kind: 'notice',
            eventId: `scenario-reaction:${actor.id}:${String(now)}`,
            actorId: actor.id,
            audienceIds,
            text,
        },
    ])
}

function matchTrigger(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    trigger: ScenarioTrigger,
    now: number,
    armedAt: number
): boolean | string {
    switch (trigger.kind) {
        case 'enemy_visible': {
            const target = visibleScenarioEnemy(actor, room, now)
            if (target === undefined) {
                return false
            }
            const range =
                trigger.distanceTiles * room.navigationFor(actor).grid.tileWidth
            return distance(actor.position, target.position) <= range
                ? target.id
                : false
        }
        case 'friendly_nearby':
            return friendlyTrigger(actor, room, trigger, now)
        case 'inventory_full':
            return actor.inventory.length >= INVENTORY_CAPACITY
        case 'plot_ripe':
            return (
                visibleScenarioPlot(actor, room, trigger, now)?.phase === 'ripe'
            )
        case 'step_result':
            return matchedStepResult(run, trigger, armedAt)
    }
}

function matchedStepResult(
    run: ScenarioRuntime,
    trigger: Extract<ScenarioTrigger, { kind: 'step_result' }>,
    armedAt: number
): boolean {
    const result = run.lastStepResult
    return (
        result !== undefined &&
        result.at >= armedAt &&
        result.stepId === trigger.stepId &&
        result.status === trigger.status
    )
}

function friendlyTrigger(
    actor: GameCharacter,
    room: GameRoom,
    trigger: Extract<ScenarioTrigger, { kind: 'friendly_nearby' }>,
    now: number
): false | string {
    if (
        trigger.onlyWhenNotFollowing === true &&
        snapshotControl(actor).mode === 'follow'
    ) {
        return false
    }
    return (
        findFriendlyScenarioTarget(actor, room, now, trigger.distanceTiles)
            ?.id ?? false
    )
}
