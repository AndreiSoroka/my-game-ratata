import {
    type CharacterSnapshot,
    DOOR_INTERACTION_RANGE,
    doorActionForState,
    doorApproachPoints,
    type Vector2,
    type WorldObjectSnapshot,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { tGame, tLocalized } from '@/shared/lib/i18n'

import { nearestByKind, targetInteractionDistance } from './interactionTargets'
import type { InteractionAction } from './nearbyInteractionActions'

const doorLabels = {
    close: 'game.world.closeDoor',
    knock: 'game.world.knockDoor',
    open: 'game.world.openDoor',
} as const

export function worldInteractionTargets(snapshot: WorldSnapshot, player: CharacterSnapshot) {
    return (snapshot.adventure?.worldObjects ?? []).map((object) => ({
        key: `world:${object.id}`,
        name: tLocalized(object.nameMessage, object.name),
        position: object.position,
        bounds: object.bounds,
        interactionAreas: object.interactionAreas,
        door: object.door,
        range: object.kind === 'door' ? DOOR_INTERACTION_RANGE : 48,
        actions: worldInteractionActions(
            { ...snapshot, adventure: { ...snapshot.adventure!, worldObjects: [object] } },
            player
        ),
    }))
}

export function worldInteractionActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    isVisible: (position: Vector2) => boolean = () => true
): InteractionAction[] {
    const distance = (target: WorldObjectSnapshot) =>
        targetInteractionDistance(player.position, target)
    const objects = (snapshot.adventure?.worldObjects ?? []).filter(
        (target) =>
            target.kind !== 'barrel' &&
            (target.kind !== 'bell' || target.bell?.state === 'prepared') &&
            (target.kind === 'door'
                ? target.door !== undefined &&
                  doorApproachPoints(target.bounds, target.door.state).some(
                      (point) =>
                          Math.hypot(point.x - player.position.x, point.y - player.position.y) <=
                              DOOR_INTERACTION_RANGE && isVisible(point)
                  )
                : distance(target) <= 48 && isVisible(target.position))
    )
    const labels = {
        sign: tGame('game.world.read'),
        barrel: tGame('game.world.inspect'),
        water: tGame('game.world.drink'),
        bell: tGame('game.world.awaken'),
        quest_board: tGame('game.quests.readBoard'),
    }
    return nearestByKind(objects, (target) => target.kind, distance).map((target) => {
        if (target.kind === 'door') {
            const doorAction = doorActionForState(target.door!.state)
            return {
                id: `world:${target.id}`,
                label: tGame(doorLabels[doorAction]),
                command: { type: 'world_interact', objectId: target.id, doorAction },
            }
        }
        return {
            id: `world:${target.id}`,
            label:
                target.kind === 'quest_board'
                    ? labels.quest_board
                    : `${labels[target.kind]}: ${tLocalized(target.nameMessage, target.name)}`,
            command: { type: 'world_interact', objectId: target.id },
        }
    })
}
