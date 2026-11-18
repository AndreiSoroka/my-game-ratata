import type {
    AdventureDialogue,
    AgentDecision,
    CharacterSnapshot,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    CENTER_LOCATION_ID,
    interactionApproachPoints,
} from '@my-game-ratata/contracts'

import { adventureNpcRoles } from '../game/adventureContent'
import { resolveAdventureNpc } from '../game/adventureNpc'
import type { GameCharacter } from '../game/character'
import { CONVERSATION_REACH } from '../game/conversationSessions'
import {
    containsBuildingPoint,
    type MapBuildingDefinition,
} from '../game/mapBuildings'
import { distance } from '../game/math'
import type { NavigationService } from '../game/navigation'
import { visibilityRadius } from '../game/queries'
import { knownGuidePlaces } from './guideTargets'
import { environmentTargets } from './observationEnvironment'
import { buildingTargets, landmarkTargets } from './observationPlaces'
import {
    characterSocialDetails,
    filterNpcAiDialogue,
    filterNpcAiTargets,
    npcAiCapabilities,
    updateNpcAiSocialCapabilities,
} from './observationPolicy'
import type {
    NpcAiObservation,
    NpcAiTarget,
    NpcAiWorld,
} from './observationTypes'
export type {
    NpcAiObservation,
    NpcAiTarget,
    NpcAiWorld,
} from './observationTypes'
import type { NpcAiRole } from './types'

const observationRadius = 240
/** A model receives the actor's earned projection, never the debugging snapshot. */
export function buildNpcAiObservation(
    world: NpcAiWorld,
    actor: GameCharacter,
    role: NpcAiRole,
    now: number
): NpcAiObservation {
    const snapshot = world.snapshot(now, actor.locationId, actor.id)
    const navigation = world.navigationFor(actor)
    const buildings = navigation.grid.buildings ?? []
    const visible = (point: Vector2): boolean =>
        distance(actor.position, point) <= observationRadius &&
        visibleBuildingPoint(buildings, actor.position, point) &&
        navigation.hasLineOfSight(actor.position, point)
    const characters = observedCharacters(world, actor, snapshot, visible, now)
    const nearby = [
        ...characters.map((entry) => characterTarget(actor, entry)),
        ...environmentTargets(snapshot, actor, navigation, visible),
    ]
        .sort(compareTargets)
        .slice(0, 32)
    const dialogue = filterNpcAiDialogue(
        actor,
        role,
        currentDialogue(world, actor, snapshot, navigation, now)
    )
    const targets = filterNpcAiTargets(actor, role, [
        ...nearby,
        ...buildingTargets(buildings, actor),
        ...landmarkTargets(actor, navigation),
    ])
    const observedMerchant =
        dialogue !== null &&
        adventureNpcRoles[dialogue.npcId]?.trade === true &&
        characters.some((entry) => entry.id === dialogue.npcId)
    const observation: NpcAiObservation = {
        knownPlaces: knownGuidePlaces(actor, navigation),
        tick: snapshot.tick,
        serverTime: now,
        locationId: actor.locationId,
        locationName: snapshot.location?.name ?? actor.locationId,
        self: observeSelf(snapshot, actor),
        targets,
        dialogue,
        dialogueCommands:
            dialogue?.choices.map((choice) => ({
                type: 'dialogue_choice',
                choiceId: choice.id,
            })) ?? [],
        ...(observedMerchant && snapshot.adventure?.market !== undefined
            ? {
                  market: snapshot.adventure.market,
                  shop: snapshot.adventure.shop,
              }
            : {}),
        ...observeCity(world, actor, role, now, targets),
        capabilities: npcAiCapabilities(role, targets, dialogue, actor),
    }
    Object.assign(observation, { social: snapshot.social })
    updateNpcAiSocialCapabilities(observation)
    return structuredClone(observation)
}

/** A roof hides its residents until the observer has entered that same building. */
function visibleBuildingPoint(
    buildings: readonly MapBuildingDefinition[],
    observer: Vector2,
    target: Vector2
): boolean {
    return buildings.every(
        (building) =>
            !containsBuildingPoint(building.bounds, target) ||
            containsBuildingPoint(building.bounds, observer)
    )
}

function characterTarget(
    actor: GameCharacter,
    target: CharacterSnapshot
): NpcAiTarget {
    const range = distance(actor.position, target.position)
    const commands: AgentDecision[] = [moveTo(target.position)]
    if (
        range <= CONVERSATION_REACH &&
        target.alive &&
        target.soul?.canSpeak === true &&
        target.controllerKind !== 'network_player' &&
        target.faction === 'peaceful'
    ) {
        commands.push({ type: 'interact', targetId: target.id })
    }
    return {
        key: `character:${target.id}`,
        kind: 'character',
        id: target.id,
        name: target.nickname,
        position: { ...target.position },
        distance: range,
        interactionRange: CONVERSATION_REACH,
        commands,
        details: {
            controllerKind: target.controllerKind,
            connected: target.connected === true,
            canReceiveQuest:
                target.controllerKind === 'network_player' &&
                target.connected === true,
            spark: target.soul?.kind === 'spark',
            alive: target.alive,
            health: target.health,
            relationship: target.relationship,
            ...characterSocialDetails(actor, target),
            creatureType: target.creatureType,
            canSpeak: target.soul?.canSpeak ?? false,
        },
    }
}

function currentDialogue(
    world: NpcAiWorld,
    actor: GameCharacter,
    snapshot: WorldSnapshot,
    navigation: NavigationService,
    now: number
): AdventureDialogue | null {
    const dialogue = snapshot.adventure?.dialogue
    if (dialogue === undefined || dialogue === null) {
        return null
    }
    if (dialogue.kind === 'sign') {
        const sign = snapshot.adventure?.worldObjects?.find(
            (object) => object.id === dialogue.npcId && object.kind === 'sign'
        )
        return sign !== undefined &&
            interactionApproachPoints(
                actor.position,
                sign.interactionAreas ?? [sign.bounds]
            ).some(
                (point) =>
                    distance(actor.position, point) <= CONVERSATION_REACH &&
                    navigation.hasLineOfSight(actor.position, point)
            )
            ? dialogue
            : null
    }
    const npc = world.getCharacter(dialogue.npcId)
    return npc !== undefined &&
        resolveAdventureNpc(actor, dialogue.npcId, [npc], now, navigation) !==
            undefined
        ? dialogue
        : null
}

function moveTo(target: Vector2): AgentDecision {
    return { type: 'move_to', target: { ...target } }
}

function compareTargets(a: NpcAiTarget, b: NpcAiTarget): number {
    const delta = a.distance - b.distance
    return delta !== 0 ? delta : a.key.localeCompare(b.key)
}

function observedCharacters(
    world: NpcAiWorld,
    actor: GameCharacter,
    snapshot: WorldSnapshot,
    visible: (point: Vector2) => boolean,
    now: number
): CharacterSnapshot[] {
    return snapshot.characters.filter((entry) => {
        const target = world.getCharacter(entry.id)
        if (target?.locationId !== actor.locationId || entry.id === actor.id) {
            return false
        }
        return (
            !target.tags.has('offline') &&
            !target.tags.has('state.retired') &&
            distance(actor.position, entry.position) <=
                visibilityRadius(actor, target, observationRadius, now) &&
            visible(entry.position)
        )
    })
}

function observeSelf(
    snapshot: WorldSnapshot,
    actor: GameCharacter
): NpcAiObservation['self'] {
    const own = snapshot.characters.find((entry) => entry.id === actor.id)
    if (own === undefined) {
        throw new Error('NPC observation requires its living identity snapshot')
    }
    return {
        id: own.id,
        nickname: own.nickname,
        position: { ...own.position },
        alive: own.alive,
        health: own.health,
        resources: own.resources,
        inventory: own.inventory,
        equipment: own.equipment,
        ...(own.control === undefined ? {} : { control: own.control }),
        ...(own.abilities === undefined ? {} : { abilities: own.abilities }),
        ...(own.resourceChecks === undefined
            ? {}
            : { resourceChecks: own.resourceChecks }),
        gold: snapshot.adventure?.gold ?? 0,
    }
}

function observeCity(
    world: NpcAiWorld,
    actor: GameCharacter,
    role: NpcAiRole,
    now: number,
    targets: NpcAiTarget[]
): Pick<NpcAiObservation, 'city'> {
    if (
        role !== 'city_coordinator' ||
        actor.locationId !== CENTER_LOCATION_ID
    ) {
        return {}
    }
    const market = world
        .adventureForWorkers()
        .economy.snapshot(CENTER_LOCATION_ID, now)
    return {
        city: {
            ...(market === undefined ? {} : { market }),
            requests: world.workerRequests.list(CENTER_LOCATION_ID),
            ...(world.social === undefined
                ? {}
                : {
                      municipalQuestGold: world.social.quests.cityFund(
                          actor.locationId
                      ),
                  }),
            workers: targets.flatMap((target) => {
                const activity = world.social?.workerActivity(target.id, now)
                return activity === undefined
                    ? []
                    : [{ id: target.id, name: target.name, activity }]
            }),
        },
    }
}
