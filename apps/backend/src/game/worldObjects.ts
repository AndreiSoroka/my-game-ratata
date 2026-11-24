import {
    authoredMessage,
    authoredRussian,
    type GameEventPayload,
    interactionApproachPoints,
    type WorldObjectSnapshot,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityWorldState } from './cityWorldState'
import { resetMartyrStreak } from './martyr'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { setAuthoredNotice, setNotice } from './notices'
import { restoreEnergy } from './resourcePractice'
import { nextSpeechId } from './speechReceipts'
import { loadWorldObjects, type WorldObjectDefinition } from './worldObjectData'
import { withWorldSound } from './worldSound'

export class WorldObjects {
    private readonly drinkAllowedAt = new Map<string, number>()

    public constructor(
        private readonly definitions?: WorldObjectDefinition[],
        private readonly openContainer?: (
            actor: GameCharacter,
            id: string,
            now: number
        ) => AdventureActionResult,
        private readonly cities?: CityWorldState,
        private readonly navigationForLocation?: (
            id: string
        ) => NavigationService
    ) {}

    public forgetActor(actorId: string): void {
        this.drinkAllowedAt.delete(actorId)
    }

    public open(
        actor: GameCharacter,
        id: string,
        now: number
    ): AdventureActionResult | undefined {
        if (
            !this.inLocation(actor.locationId).some(
                (object) => object.id === id && object.kind === 'barrel'
            )
        ) {
            return undefined
        }
        return (
            this.openContainer?.(actor, id, now) ?? {
                accepted: false,
                error: 'Контейнер недоступен.',
                events: [],
            }
        )
    }

    public snapshot(locationId: string): WorldObjectSnapshot[] {
        const navigation = this.navigationForLocation?.(locationId)
        return this.inLocation(locationId)
            .filter(
                (object) =>
                    object.kind !== 'barrel' &&
                    (object.kind !== 'door' ||
                        navigation === undefined ||
                        navigation.door(object.id) !== undefined)
            )
            .map((object) => ({
                id: object.id,
                kind: object.kind,
                name: object.name,
                ...(object.nameMessage === undefined
                    ? {}
                    : { nameMessage: object.nameMessage }),
                bounds: { ...object.bounds },
                ...(object.interactionAreas === undefined
                    ? {}
                    : {
                          interactionAreas: object.interactionAreas.map(
                              (area) => ({
                                  ...area,
                              })
                          ),
                      }),
                position: {
                    x: object.bounds.x + object.bounds.width / 2,
                    y: object.bounds.y + object.bounds.height / 2,
                },
                depleted: false,
                ...(object.doorState === undefined
                    ? {}
                    : {
                          door: {
                              state:
                                  navigation?.door(object.id)?.state ??
                                  object.doorState,
                          },
                      }),
                ...this.bellSnapshot(object),
            }))
    }

    public canReadQuestBoard(
        actor: GameCharacter,
        objectId: string,
        navigation: NavigationService | undefined,
        now: number
    ): boolean {
        const board = this.inLocation(actor.locationId).find(
            (object) => object.kind === 'quest_board' && object.id === objectId
        )
        return actor.connected && canInteract(actor, board, navigation, now)
    }

    public interact(
        actor: GameCharacter,
        state: PlayerAdventure,
        objectId: string,
        navigation: NavigationService | undefined,
        now: number
    ): GameEventPayload[] {
        const object = this.inLocation(actor.locationId).find(
            (candidate) => candidate.id === objectId
        )
        if (object?.kind === 'barrel') {
            return this.open(actor, object.id, now)?.events ?? []
        }
        if (
            !canInteract(actor, object, navigation, now) ||
            object.kind === 'door'
        ) {
            setAuthoredNotice(state, 'world.outOfReach')
            return []
        }
        if (object.kind === 'sign' || object.kind === 'quest_board') {
            readWorldObject(actor, state, object)
            return []
        }
        if (object.kind === 'bell') {
            return this.ringBell(actor, state, object)
        }
        return this.drink(actor, state, now)
    }

    private bellSnapshot(
        object: WorldObjectDefinition
    ): Pick<WorldObjectSnapshot, 'bell'> {
        if (object.kind !== 'bell') {
            return {}
        }
        const city = this.cities?.snapshot(object.locationId)
        const activationId = city?.activationId
        return {
            bell: {
                state: city?.bellState ?? 'silent',
                ...(activationId === undefined ? {} : { activationId }),
            },
        }
    }

    private ringBell(
        actor: GameCharacter,
        state: PlayerAdventure,
        object: WorldObjectDefinition
    ): GameEventPayload[] {
        const definition = this.cities?.byBell(object.id)
        const city = this.cities?.snapshot(object.locationId)
        if (definition?.cityId !== actor.locationId || city === undefined) {
            setAuthoredNotice(state, 'world.bellUnavailable')
            return []
        }
        if (city.bellState !== 'prepared') {
            setAuthoredNotice(
                state,
                city.bellState === 'active'
                    ? 'world.bellAlreadyActive'
                    : 'world.bellSilent'
            )
            return []
        }
        const events =
            this.cities?.activate(
                object.locationId,
                actor.id,
                {
                    x: object.bounds.x + object.bounds.width / 2,
                    y: object.bounds.y + object.bounds.height / 2,
                },
                object.bounds
            ) ?? []
        if (events[0]?.text === undefined) {
            setAuthoredNotice(state, 'world.bellActivated')
        } else {
            setNotice(state, events[0].text, events[0].textMessage)
        }
        return events
    }

    private drink(
        actor: GameCharacter,
        state: PlayerAdventure,
        now: number
    ): GameEventPayload[] {
        if (now < (this.drinkAllowedAt.get(actor.id) ?? 0)) {
            setAuthoredNotice(state, 'world.drinkWait')
            return []
        }
        const { restored: recovered, events } = restoreEnergy(actor, 15, now)
        if (recovered > 0) {
            resetMartyrStreak(actor)
        }
        this.drinkAllowedAt.set(actor.id, now + 5_000)
        const key = recovered > 0 ? 'world.drinkRestore' : 'world.drinkFull'
        const text = setAuthoredNotice(state, key)
        return [
            ...events,
            withWorldSound(
                {
                    kind: 'water_drink',
                    actorId: actor.id,
                    text,
                    textMessage: authoredMessage(key),
                },
                'drink',
                actor.locationId,
                actor.position,
                { sourceActorId: actor.id }
            ),
        ]
    }

    private inLocation(locationId: string): WorldObjectDefinition[] {
        return (
            this.definitions?.filter(
                (object) => object.locationId === locationId
            ) ?? loadWorldObjects(locationId)
        )
    }
}

function readWorldObject(
    actor: GameCharacter,
    state: PlayerAdventure,
    object: WorldObjectDefinition
): void {
    const board = object.kind === 'quest_board'
    if (board && !actor.connected) {
        return
    }
    setNotice(state, null)
    state.dialogue = {
        kind: board ? 'quest_board' : 'sign',
        speechId: nextSpeechId(actor),
        npcId: board ? object.id : `object:${object.id}`,
        npcName: object.name,
        ...(object.nameMessage === undefined
            ? {}
            : {
                  npcNameMessage: object.nameMessage,
                  titleMessage: object.nameMessage,
              }),
        title: object.name,
        text: object.text,
        ...(object.textMessage === undefined
            ? {}
            : { textMessage: object.textMessage }),
        canTrade: false,
        choices: [
            {
                id: 'leave',
                label: authoredRussian('dialogue.close'),
                labelMessage: authoredMessage('dialogue.close'),
            },
        ],
    }
}

function canInteract(
    actor: GameCharacter,
    object: WorldObjectDefinition | undefined,
    navigation: NavigationService | undefined,
    now: number
): object is WorldObjectDefinition {
    if (
        object === undefined ||
        navigation === undefined ||
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired') ||
        actor.stunUntil > now ||
        actor.isActionLocked(now)
    ) {
        return false
    }
    // Reach an exterior edge of a solid barrel or trough.
    const approaches = interactionApproachPoints(
        actor.position,
        object.interactionAreas ?? [object.bounds]
    )
    return approaches.some(
        (point) =>
            distance(actor.position, point) <= 48 &&
            navigation.hasLineOfSight(actor.position, point)
    )
}
