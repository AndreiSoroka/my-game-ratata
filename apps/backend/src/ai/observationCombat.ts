import {
    type AgentDecision,
    type CharacterSnapshot,
    graveBounds,
    interactionApproachPoints,
    SHOT_HALF_WIDTH,
    SPARK_HALF_WIDTH,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import {
    buildAttackZones,
    forwardAttackZones,
    isInZones,
} from '../game/combatGeometry'
import { canUseCombat } from '../game/combatPermission'
import {
    effectiveAbility,
    ordinaryAttackRadius,
} from '../game/effectiveParameters'
import { distance, resolveFacing } from '../game/math'
import type { NavigationService } from '../game/navigation'
import type { NpcAiTarget } from './observationTypes'
import type { NpcAiRole } from './types'

export function observedCharacterAttack(
    actor: GameCharacter,
    target: CharacterSnapshot,
    navigation: NavigationService
): Extract<AgentDecision, { type: 'attack' }> | undefined {
    return canUseCombat(actor) &&
        target.alive &&
        (target.relationship === 'hostile' ||
            target.trainingTarget !== undefined) &&
        inAttackReach(actor, actor.position, target.position, navigation)
        ? { type: 'attack', targetId: target.id }
        : undefined
}

export function observedGraves(
    snapshot: WorldSnapshot,
    actor: GameCharacter,
    role: NpcAiRole,
    navigation: NavigationService,
    visible: (point: Vector2) => boolean
): NpcAiTarget[] {
    if (role !== 'companion') {
        return []
    }
    return (snapshot.graves ?? [])
        .filter(
            (grave) =>
                grave.locationId === actor.locationId && visible(grave.position)
        )
        .map((grave) => {
            const commands: AgentDecision[] = []
            if (grave.phase === 'active' && canUseCombat(actor)) {
                if (
                    inAttackReach(
                        actor,
                        actor.position,
                        grave.position,
                        navigation
                    )
                ) {
                    commands.push({
                        type: 'attack',
                        target: { kind: 'grave', id: grave.id },
                    })
                } else {
                    const approach = interactionApproachPoints(actor.position, [
                        graveBounds(grave.position),
                    ]).find(
                        (point) =>
                            visible(point) &&
                            inAttackReach(
                                actor,
                                point,
                                grave.position,
                                navigation
                            ) &&
                            navigation.hasLineOfSight(point, grave.position) &&
                            navigation.findPathWorld(actor.position, point)
                                .length > 0
                    )
                    if (approach !== undefined) {
                        commands.push({ type: 'move_to', target: approach })
                    }
                }
            }
            return {
                kind: 'grave',
                key: `grave:${grave.id}`,
                id: grave.id,
                name: 'Могила',
                position: grave.position,
                distance: distance(actor.position, grave.position),
                interactionRange: ordinaryAttackRadius(
                    actor,
                    navigation.grid.tileWidth
                ),
                commands,
                details: {
                    phase: grave.phase,
                    material: grave.material,
                    health: grave.health,
                },
            }
        })
}

function inAttackReach(
    actor: GameCharacter,
    origin: Vector2,
    target: Vector2,
    navigation: NavigationService
): boolean {
    const facing = resolveFacing(
        { x: target.x - origin.x, y: target.y - origin.y },
        actor.facing
    )
    const pose = {
        id: actor.id,
        config: actor.config,
        position: origin,
        facing,
    }
    const tileWidth = navigation.grid.tileWidth
    const kind = actor.config.basicAttackKind
    return isInZones(
        { position: target },
        kind === 'melee'
            ? buildAttackZones(pose, tileWidth)
            : forwardAttackZones(
                  pose,
                  effectiveAbility(
                      actor,
                      kind === 'arrow' ? 'shot' : 'spark',
                      tileWidth
                  ).range,
                  kind === 'arrow' ? SHOT_HALF_WIDTH : SPARK_HALF_WIDTH
              )
    )
}
