import type {
    GameEventPayload,
    Vector2,
    WorldObjectSnapshot,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { addInventoryItems, createItemInstance } from './inventory'
import { clamp, distance } from './math'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { nextSpeechId } from './speechReceipts'
import { loadWorldObjects, type WorldObjectDefinition } from './worldObjectData'

export class WorldObjects {
    private readonly searched = new Set<string>()
    private readonly drinkAllowedAt = new Map<string, number>()

    public constructor(
        private readonly definitions?: WorldObjectDefinition[]
    ) {}

    public forgetActor(actorId: string): void {
        this.drinkAllowedAt.delete(actorId)
    }

    public snapshot(locationId: string): WorldObjectSnapshot[] {
        return this.inLocation(locationId).map((object) => ({
            id: object.id,
            kind: object.kind,
            name: object.name,
            bounds: { ...object.bounds },
            position: {
                x: object.bounds.x + object.bounds.width / 2,
                y: object.bounds.y + object.bounds.height / 2,
            },
            depleted: this.searched.has(object.id),
        }))
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
        if (!canInteract(actor, object, navigation, now)) {
            setNotice(
                state,
                'Подойди ближе к предмету: через стену взаимодействовать нельзя.'
            )
            return []
        }
        if (object.kind === 'sign') {
            setNotice(state, null)
            state.dialogue = {
                kind: 'sign',
                speechId: nextSpeechId(actor),
                npcId: `object:${object.id}`,
                npcName: object.name,
                title: object.name,
                text: object.text,
                canTrade: false,
                choices: [{ id: 'leave', label: 'Закрыть' }],
            }
            return []
        }
        if (object.kind === 'water') {
            return this.drink(actor, state, now)
        }
        if (this.searched.has(object.id)) {
            setNotice(state, 'Бочка пуста. Общие припасы уже забрали.')
            return []
        }
        if (
            !addInventoryItems(actor.inventory, [
                createItemInstance('wood'),
                createItemInstance('fiber'),
            ])
        ) {
            setNotice(
                state,
                'В рюкзаке нет места для всех припасов. Они остались в бочке.'
            )
            return []
        }
        this.searched.add(object.id)
        const text = setNotice(
            state,
            'В бочке общих припасов: дерево +1, волокно +1. Добавлено в рюкзак.'
        )
        return [{ kind: 'barrel_search', actorId: actor.id, text }]
    }

    private drink(
        actor: GameCharacter,
        state: PlayerAdventure,
        now: number
    ): GameEventPayload[] {
        if (now < (this.drinkAllowedAt.get(actor.id) ?? 0)) {
            setNotice(state, 'Ты только что попил. Подожди немного.')
            return []
        }
        const recovered = Math.min(
            15,
            actor.config.resources.maxEnergy - actor.energy
        )
        actor.energy += recovered
        this.drinkAllowedAt.set(actor.id, now + 5_000)
        const text = setNotice(
            state,
            recovered > 0
                ? `Прохладная вода освежает. Энергия +${String(Math.round(recovered))}.`
                : 'Ты утолил жажду. Силы уже восстановлены.'
        )
        return [{ kind: 'water_drink', actorId: actor.id, text }]
    }

    private inLocation(locationId: string): WorldObjectDefinition[] {
        return (
            this.definitions?.filter(
                (object) => object.locationId === locationId
            ) ?? loadWorldObjects(locationId)
        )
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
    return interactionEdges(object, actor.position).some(
        (point) =>
            distance(actor.position, point) <= 48 &&
            navigation.hasLineOfSight(actor.position, point)
    )
}

/** Check the exterior, since a barrel/trough itself correctly occupies a solid tile. */
function interactionEdges(
    object: WorldObjectDefinition,
    actor: Vector2
): Vector2[] {
    const { x, y, width, height } = object.bounds
    const horizontal = clamp(actor.x, x, x + width)
    const vertical = clamp(actor.y, y, y + height)
    return [
        { x: horizontal, y: y - 1 },
        { x: horizontal, y: y + height + 1 },
        { x: x - 1, y: vertical },
        { x: x + width + 1, y: vertical },
    ]
}
