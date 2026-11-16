import {
    type GraveSourceDefinition,
    PURSUIT_RULES,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import { clearPursuit, pursuits, territories } from './pursuitState'

/** A stable role among an existing source's children, never a separate spawn. */
export class GraveGuardians {
    private readonly assigned = new Map<string, GameCharacter>()

    public release(sourceId: string): void {
        const actor = this.assigned.get(sourceId)
        if (actor !== undefined) {
            territories.delete(actor)
            actor.tags.delete('grave.guardian')
            clearPursuit(actor)
        }
        this.assigned.delete(sourceId)
    }

    public sync(
        source: GraveSourceDefinition,
        children: ReadonlySet<string>,
        characters: ReadonlyMap<string, GameCharacter>
    ): void {
        const current = this.assigned.get(source.id)
        if (
            current?.alive === true &&
            characters.get(current.id) === current &&
            !current.tags.has('state.retired')
        ) {
            return
        }
        this.release(source.id)
        const actor = [...children]
            .map((id) => characters.get(id))
            .filter(
                (child): child is GameCharacter =>
                    child?.alive === true && !child.tags.has('state.retired')
            )
            .sort((a, b) => {
                const difference =
                    guardianDistance(a, source) - guardianDistance(b, source)
                return !Number.isNaN(difference) && difference !== 0
                    ? difference
                    : a.id.localeCompare(b.id)
            })[0]
        if (actor === undefined) {
            return
        }
        this.assigned.set(source.id, actor)
        const home = {
            locationId: source.locationId,
            position: { ...source.position },
        }
        territories.set(actor, { sourceId: source.id, ...home })
        actor.tags.add('grave.guardian')
        clearPursuit(actor)
        if (
            guardianDistance(actor, source) > PURSUIT_RULES.guardianPatrolRadius
        ) {
            pursuits.set(actor, {
                phase: 'return',
                targetId: '',
                home,
                lastKnown: { ...home.position },
                lastSeenAt: 0,
                lastPlanAt: -Infinity,
                sightRadius: 112,
            })
        }
    }
}

function guardianDistance(
    actor: GameCharacter,
    source: GraveSourceDefinition
): number {
    return actor.locationId === source.locationId
        ? distance(actor.position, source.position)
        : Infinity
}
