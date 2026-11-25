import type {
    CharacterSnapshot,
    GameEventPayload,
    ItemId,
    ProjectilePath,
    TrainingAreaDefinition,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { BoundingBox, Engine, type ImageSource, type SpriteSheet } from 'excalibur'

import type { CharacterId } from '../assets/characterCatalog'
import type { BellImages } from './bellViews'
import { BuildingViews } from './buildingViews'
import { CombatEffects } from './combatEffects'
import { CorpseViews } from './corpseViews'
import { DepthPropViews } from './depthPropViews'
import { FootstepViews } from './footstepViews'
import { InteractionObjectViews } from './interactionObjectViews'
import { InteractionTargetViews, type TargetHighlight } from './interactionTargetViews'
import type { MagicViews } from './magicViews'
import {
    interactionHasLineOfSight,
    type MapVisibility,
    updateObstacleVisibility,
} from './mapVisibility'
import type { MotionTiming } from './ownerMotionLead'
import type { PrayerAreaViews } from './prayerAreaViews'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { RouteWaypointViews } from './routeWaypointViews'
import type { SnapshotReference } from './runtimeSnapshotStream'
import { SceneCharacterViews } from './sceneCharacterViews'
import { SceneMapView } from './sceneMapActor'
import { StatusViews } from './statusViews'
import type { RenderedTiledMap } from './tiledMap'
import { observerTrainingArea, TrainingGuides } from './trainingGuides'
import { WorldSceneActors } from './worldSceneActors'

export class SceneActors {
    private readonly characters: SceneCharacterViews
    private gravePositions = new Map<string, Vector2>()
    private readonly buildingViews: BuildingViews
    private readonly interactionObjects: InteractionObjectViews
    private readonly depthProps: DepthPropViews
    private readonly corpseViews: CorpseViews
    private readonly worldActors: WorldSceneActors
    private readonly guides: TrainingGuides
    private trainingAreas: TrainingAreaDefinition[] = []
    private readonly combatTarget: InteractionTargetViews
    private mapVisibility: MapVisibility | undefined
    private playerPosition: Vector2 | undefined
    private readonly mapView: SceneMapView
    private mapBounds = new BoundingBox()
    private localPlayerId: string | undefined
    private readonly statusViews: StatusViews
    private readonly footsteps: FootstepViews
    private readonly combatEffects: CombatEffects
    private readonly routeWaypoints: RouteWaypointViews

    public constructor(
        private readonly engine: Engine,
        sheets: Map<CharacterId, SpriteSheet>,
        itemImages: Map<ItemId, ImageSource>,
        chestImage: ImageSource,
        farmImage: ImageSource,
        bellImages: BellImages,
        private readonly magicViews: MagicViews,
        private readonly prayerAreas: PrayerAreaViews
    ) {
        this.mapView = new SceneMapView(engine, this.characterPosition, magicViews.portalPositions)
        this.interactionObjects = new InteractionObjectViews(engine, bellImages)
        this.guides = new TrainingGuides(engine)
        const characterVisible = (id: string) => this.isCharacterVisible(id)
        this.combatTarget = new InteractionTargetViews(
            engine,
            characterVisible,
            this.characterPosition
        )
        this.routeWaypoints = new RouteWaypointViews(engine)
        this.buildingViews = new BuildingViews(engine)
        this.depthProps = new DepthPropViews(engine)
        this.corpseViews = new CorpseViews(engine, sheets)
        this.worldActors = new WorldSceneActors(engine, itemImages, chestImage, farmImage)
        this.statusViews = new StatusViews(engine, this.characterPosition)
        this.footsteps = new FootstepViews(engine, itemImages.get('boots'))
        this.combatEffects = new CombatEffects(
            engine,
            (id) => (this.isCharacterVisible(id) ? this.characters.snapshot(id) : undefined),
            (target) => {
                const position = this.gravePositions.get(target.id)
                return position && this.isPositionVisible(position) ? { position } : undefined
            },
            this.characterPosition
        )
        this.characters = new SceneCharacterViews(
            engine,
            sheets,
            (id) => {
                this.combatEffects.forgetCharacter(id)
                this.combatTarget.forgetCharacter(id)
            },
            () => this.placeAttachedViews()
        )
    }

    public clearDamage(): void {
        this.guides.clear()
        this.characters.clearDamage()
        this.combatEffects.clear()
        this.magicViews.clear()
        this.prayerAreas.clear()
        this.statusViews.clear()
        this.footsteps.clear()
    }
    public dispose(): void {
        this.interactionObjects.dispose()
        this.mapView.dispose()
        this.guides.dispose()
        this.corpseViews.dispose()
        this.depthProps.dispose()
        this.characters.dispose()
        this.combatEffects.dispose()
        this.magicViews.dispose()
        this.prayerAreas.clear()
        this.statusViews.dispose()
        this.footsteps.dispose()
        this.routeWaypoints.dispose()
        this.combatTarget.dispose()
        this.mapVisibility?.resourceInterest?.clear()
        this.mapVisibility = this.playerPosition = undefined
        this.gravePositions.clear()
    }
    public showDamage(event: GameEventPayload): void {
        this.interactionObjects.receive(event)
        this.combatEffects.receive(event)
        this.characters.receive(event, event.targetId === this.localPlayerId)
    }

    public addMap(map: RenderedTiledMap): void {
        this.clearDamage()
        this.corpseViews.dispose()
        this.depthProps.dispose()
        this.clearTargetHighlights()
        this.routeWaypoints.clear()
        this.interactionObjects.setMap(map.visibility)
        this.trainingAreas = map.training.areas
        this.mapVisibility?.resourceInterest?.clear()
        this.mapVisibility = map.visibility
        this.characters.setMap(map.visibility)
        this.playerPosition = undefined
        this.gravePositions.clear()
        this.mapBounds = new BoundingBox(0, 0, map.worldWidth, map.worldHeight)
        this.mapView.setMap(map)
        this.depthProps.setProps(map.depthProps, map.harvestGraphics)
        this.buildingViews.setBuildings(map.buildings)
    }

    public update(
        snapshot: WorldSnapshot,
        localPlayerId: string | undefined,
        reference?: SnapshotReference
    ): void {
        if (this.localPlayerId !== localPlayerId) this.clearTargetHighlights()
        this.localPlayerId = localPlayerId
        this.updateResourceViews(snapshot)
        const player = snapshot.characters.find((character) => character.id === localPlayerId)
        this.updateObserver(player, snapshot)
        this.routeWaypoints.updateSnapshot(snapshot, player, this.isPositionVisible)
        this.buildingViews.update(player?.position)
        this.magicViews.sync(snapshot, this.isPositionVisible)
        this.interactionObjects.update(snapshot, player, this.isPositionVisible, (point) =>
            this.isInteractionVisible(point, undefined, Infinity)
        )

        this.characters.sync(
            snapshot,
            localPlayerId,
            (character) =>
                character.id === localPlayerId || this.isPositionVisible(character.position),
            reference
        )

        const visibleCharacters = snapshot.characters.filter((character) =>
            this.isCharacterVisible(character.id)
        )
        this.statusViews.sync(visibleCharacters)
        this.combatEffects.sync(visibleCharacters)
        this.prayerAreas.sync(visibleCharacters, snapshot.serverTime)
        this.placeAttachedViews()
        this.corpseViews.update(snapshot.chests, snapshot.characters)
        this.worldActors.update(
            snapshot.items,
            snapshot.chests.filter((container) => container.kind !== 'corpse'),
            snapshot.adventure?.resourceNodes,
            snapshot.adventure?.farmPlots,
            snapshot.serverTime
        )
        this.guides.update(
            observerTrainingArea(this.trainingAreas, player),
            snapshot.characters,
            (id) => {
                const actor = this.characters.snapshot(id)
                return (
                    this.isCharacterVisible(id) &&
                    actor !== undefined &&
                    (id === localPlayerId ||
                        this.isInteractionVisible(actor.position, undefined, 240))
                )
            },
            player
        )
        const body = player && this.characters.body(player.id)
        if (body) this.mapView.follow(body)
        this.mapView.updateLighting(snapshot.characters, localPlayerId)
    }

    public readonly buildingCoverStates = () => this.buildingViews.coverStates()
    public readonly prayerAreaStates = () => this.prayerAreas.states()
    public readonly heardFootstepIds = () => this.footsteps.ids()
    public readonly characterOpacity = (id: string) =>
        this.isCharacterVisible(id) ? this.characters.body(id)?.graphics.opacity : undefined
    public readonly characterNameOpacity = (id: string) => this.characters.nameOpacity(id)

    public readonly renderedCharacters = () => this.characters.rendered()
    public readonly lastDrawnOwnerPose = () => this.characters.lastDrawnOwnerPose()
    public readonly setMotionTiming = (timing: MotionTiming) =>
        this.characters.setMotionTiming(timing)
    public readonly resetMotion = () => this.characters.resetMotion()
    public readonly holdMotion = () => this.characters.holdMotion()
    public readonly beginStop = (requestId: number) =>
        this.localPlayerId ? this.characters.beginStop(this.localPlayerId, requestId) : undefined
    public readonly cancelStop = () => this.characters.cancelStop()

    private updateResourceViews(snapshot: WorldSnapshot): void {
        this.gravePositions = new Map(
            (snapshot.graves ?? []).map((grave) => [grave.id, grave.position])
        )
        const nodes = snapshot.adventure?.resourceNodes ?? []
        this.depthProps.updateResources(nodes, snapshot.viewBounds)
        this.depthProps.updateGraves(snapshot.graves ?? [], snapshot.viewBounds)
        if (this.mapVisibility)
            updateObstacleVisibility(
                this.mapVisibility,
                nodes,
                snapshot.viewBounds,
                snapshot.adventure?.worldObjects
            )
    }

    private updateObserver(player: CharacterSnapshot | undefined, snapshot: WorldSnapshot): void {
        this.playerPosition =
            player?.alive && !player.tags.includes('offline') ? player.position : undefined
        if (!this.playerPosition) this.clearTargetHighlights()
        this.footsteps.sync(snapshot, this.playerPosition !== undefined, this.mapBounds.bottom + 32)
    }

    private clearTargetHighlights(): void {
        this.setCombatTarget(undefined)
    }

    public setShotPreview(path: ProjectilePath | undefined): void {
        this.guides.setShot(path)
    }

    public clearWaypoints(): void {
        this.routeWaypoints.clear()
    }

    public setPrayerPreview(preview: PrayerPreviewHighlight | undefined): void {
        this.guides.setPrayer(preview)
    }

    public setCombatTarget(target: TargetHighlight | undefined): void {
        this.combatTarget.set(target)
        this.characters.setNameFocus(this.combatTarget.characterId)
    }

    public readonly isPositionVisible = (position: Vector2): boolean =>
        !this.buildingViews.hidesCharacter(position)

    public isInteractionVisible(
        position: Vector2,
        bounds?: WorldObjectBounds,
        range = 48
    ): boolean {
        const map = this.mapVisibility
        const from = this.playerPosition
        if (!map || !from || !this.isPositionVisible(position)) return false
        return interactionHasLineOfSight(map, from, position, bounds, range)
    }

    public readonly characterPosition = (id: string): Vector2 | undefined =>
        this.characters?.position(id)

    public isCharacterVisible(id: string): boolean {
        return this.characters.visible(id)
    }

    private placeAttachedViews(): void {
        this.statusViews.reposition()
        this.combatEffects.reposition()
        this.prayerAreas.reposition(this.characterPosition)
        this.combatTarget.reposition()
    }
}
