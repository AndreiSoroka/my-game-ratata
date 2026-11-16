import type { GameEventPayload, ServerMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../src/game/character'
import type { CombatObserver } from '../src/game/combatObservation'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { createTrainingTarget } from '../src/game/trainingTargets'
import { abilityHero } from './abilityTestHelpers'

export const trainingAreaId = 'test:training:yard'
export const trainingLocationId = 'map-2-2'
export const privacyToken = 'combat-observation-private-test-token'

export function observationNavigation(): NavigationService {
    return new NavigationService({
        id: trainingLocationId,
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(96 * 80).fill(false),
        solidLayerNames: [],
        training: {
            areas: [
                {
                    id: trainingAreaId,
                    locationId: trainingLocationId,
                    bounds: { x: 80, y: 80, width: 80, height: 80 },
                },
            ],
            targets: [
                {
                    id: 'test:training:dummy',
                    areaId: trainingAreaId,
                    locationId: trainingLocationId,
                    position: { x: 120, y: 120 },
                    visualId: 'training_dummy',
                },
            ],
        },
    })
}

export function observationFixture() {
    const observer = abilityHero()
    const target = abilityHero()
    const definition = observationNavigation().grid.training?.targets[0]
    if (definition === undefined) {
        throw new Error('Expected training target')
    }
    const dummy = createTrainingTarget(definition)
    observer.connected = true
    const characters = [observer, target, dummy]
    const view: CombatObserver = {
        observer,
        getCharacter: (id) =>
            characters.find((character) => character.id === id),
        navigation: observationNavigation(),
        now: 1000,
    }
    return { observer, target, dummy, view }
}

export function privacyRequest(path: string, body?: unknown): Request {
    return new Request(`http://localhost${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${privacyToken}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}

export function observationRoom() {
    const room = new GameRoom(observationNavigation())
    const join = (nickname?: string) => {
        const messages: ServerMessage[] = []
        const socket = {
            send: (payload: string) =>
                messages.push(JSON.parse(payload) as ServerMessage),
        } as RoomSocket
        room.handleOpen(socket)
        if (nickname !== undefined) {
            room.handleMessage(
                socket,
                JSON.stringify({ type: 'join', nickname })
            )
        }
        const init = messages.find((message) => message.type === 'world_init')
        return {
            socket,
            messages,
            init,
            actor:
                init === undefined
                    ? undefined
                    : room.getCharacter(init.playerId),
        }
    }
    return { room, join }
}

export function eventFor(
    target: GameCharacter,
    kind: GameEventPayload['kind'] = 'damage'
): GameEventPayload {
    return {
        kind,
        targetId: target.id,
        actorId: 'attacker',
        amount: 7.25,
        hitQuality: 'strong',
    }
}
