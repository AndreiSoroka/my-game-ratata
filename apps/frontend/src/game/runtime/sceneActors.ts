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
import { Actor, BoundingBox, Engine, type ImageSource, type SpriteSheet, vec } from 'excalibur'

import type { CharacterId } from '../assets/characterCatalog'
import { BuildingViews } from './buildingViews'
import { CharacterGraphics } from './characterGraphics'
import {
    type CharacterBundle,
    createBundle,
    positionBundle,
    removeBundle,
    updateBundleHealth,
} from './characterViewBundle'
import { CombatEffects } from './combatEffects'
import { CorpseViews } from './corpseViews'
import { DamageFeedback } from './damageFeedback'
import { DepthPropViews } from './depthPropViews'
import { InteractionTargetViews, type TargetHighlight } from './interactionTargetViews'
import {
    interactionHasLineOfSight,
    type MapVisibility,
    updateResourceVisibility,
} from './mapVisibility'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { RouteWaypointViews } from './routeWaypointViews'
import { createSceneMapActor } from './sceneMapActor'
import { SignReadingViews } from './signReadingViews'
import { StatusViews } from './statusViews'
import type { RenderedTiledMap } from './tiledMap'
import { observerTrainingArea, TrainingGuides } from './trainingGuides'
import { WorldSceneActors } from './worldSceneActors'

const cameraZoom = 3

export class SceneActors {
    private readonly bundles = new Map<string, CharacterBundle>()
    private gravePositions = new Map<string, Vector2>()
    private readonly buildingViews: BuildingViews
    private readonly depthProps: DepthPropViews
    private readonly corpseViews: CorpseViews
    private readonly worldActors: WorldSceneActors
    private readonly guides: TrainingGuides
    private trainingAreas: TrainingAreaDefinition[] = []
    private readonly characterGraphics: CharacterGraphics
    private readonly combatTarget: InteractionTargetViews
    private readonly interactionTarget: InteractionTargetViews
    private mapVisibility: MapVisibility | undefined
    private playerPosition: Vector2 | undefined
    private mapActor: Actor | undefined
    private mapBounds = new BoundingBox()
    private followedId: string | undefined
    private serverClockOffset = 0
    private localPlayerId: string | undefined
    private readonly statusViews: StatusViews
    private readonly combatEffects: CombatEffects
    private readonly damageFeedback: DamageFeedback
    private readonly signReading: SignReadingViews
    private readonly routeWaypoints: RouteWaypointViews

    public constructor(
        private readonly engine: Engine,
        sheets: Map<CharacterId, SpriteSheet>,
        itemImages: Map<ItemId, ImageSource>,
        chestImage: ImageSource,
        farmImage: ImageSource
    ) {
        this.characterGraphics = new CharacterGraphics(sheets)
        this.guides = new TrainingGuides(engine)
        this.combatTarget = new InteractionTargetViews(engine)
        this.interactionTarget = new InteractionTargetViews(engine)
        this.signReading = new SignReadingViews(engine)
        this.routeWaypoints = new RouteWaypointViews(engine)
        this.buildingViews = new BuildingViews(engine)
        this.depthProps = new DepthPropViews(engine)
        this.corpseViews = new CorpseViews(engine, sheets)
        this.worldActors = new WorldSceneActors(engine, itemImages, chestImage, farmImage)
        this.statusViews = new StatusViews(engine)
        this.combatEffects = new CombatEffects(
            engine,
            (id) => (this.isCharacterVisible(id) ? this.bundles.get(id)?.snapshot : undefined),
            (target) => {
                const position = this.gravePositions.get(target.id)
                return position && this.isPositionVisible(position) ? { position } : undefined
            }
        )
        this.damageFeedback = new DamageFeedback(
            engine,
            (id) => this.bundles.get(id)?.body,
            (id) => {
                const bundle = this.bundles.get(id)
                if (bundle?.snapshot) this.updateGraphic(bundle.body, bundle.snapshot)
            },
            (id) => this.bundles.get(id)?.snapshot?.trainingTarget !== undefined
        )
    }

    public clearDamage(): void {
        this.guides.clear()
        this.damageFeedback.clear()
        this.combatEffects.clear()
        this.statusViews.clear()
    }
    public dispose(): void {
        this.guides.dispose()
        this.corpseViews.dispose()
        this.depthProps.dispose()
        this.damageFeedback.dispose()
        this.combatEffects.dispose()
        this.statusViews.dispose()
        this.signReading.dispose()
        this.routeWaypoints.dispose()
        this.interactionTarget.dispose()
        this.combatTarget.dispose()
        this.mapVisibility = this.playerPosition = undefined
        this.gravePositions.clear()
    }
    public showDamage(event: GameEventPayload): void {
        this.combatEffects.receive(event)
        this.damageFeedback.show(event, event.targetId === this.localPlayerId)
    }

    public addMap(map: RenderedTiledMap): void {
        this.clearDamage()
        this.corpseViews.dispose()
        this.depthProps.dispose()
        this.interactionTarget.clear()
        this.combatTarget.clear()
        this.routeWaypoints.clear()
        this.signReading.setMap(map.visibility)
        this.trainingAreas = map.training.areas
        this.mapVisibility = map.visibility
        this.playerPosition = undefined
        this.gravePositions.clear()
        this.mapActor?.kill()
        this.mapBounds = new BoundingBox(0, 0, map.worldWidth, map.worldHeight)
        this.followedId = undefined
        this.depthProps.setProps(map.depthProps, map.harvestGraphics)
        this.buildingViews.setBuildings(map.buildings)
        const actor = createSceneMapActor(map)
        this.engine.add(actor)
        this.mapActor = actor
    }

    public update(snapshot: WorldSnapshot, localPlayerId: string | undefined): void {
        if (this.localPlayerId !== localPlayerId) this.interactionTarget.clear()
        this.localPlayerId = localPlayerId
        this.updateResourceViews(snapshot)
        this.serverClockOffset = snapshot.serverTime - performance.now()
        this.removeMissing(snapshot.characters)
        const player = snapshot.characters.find((character) => character.id === localPlayerId)
        this.playerPosition =
            player?.alive && !player.tags.includes('offline') ? player.position : undefined
        if (!this.playerPosition) this.interactionTarget.clear()
        this.routeWaypoints.updateSnapshot(snapshot, player, (position) =>
            this.isPositionVisible(position)
        )
        this.buildingViews.update(player?.position)
        this.signReading.update(snapshot.adventure?.worldObjects ?? [], player, (position) =>
            this.isPositionVisible(position)
        )

        for (const character of snapshot.characters) {
            this.updateCharacter(character, character.id === localPlayerId)
        }

        const visibleCharacters = snapshot.characters.filter((character) =>
            this.isCharacterVisible(character.id)
        )
        this.statusViews.sync(visibleCharacters)
        this.combatEffects.sync(visibleCharacters)
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
                const actor = this.bundles.get(id)?.snapshot
                return (
                    this.isCharacterVisible(id) &&
                    actor !== undefined &&
                    (id === localPlayerId ||
                        this.isInteractionVisible(actor.position, undefined, 240))
                )
            }
        )
        this.followLocalPlayer(localPlayerId)
    }

    private updateResourceViews(snapshot: WorldSnapshot): void {
        this.gravePositions = new Map(
            (snapshot.graves ?? []).map((grave) => [grave.id, grave.position])
        )
        const nodes = snapshot.adventure?.resourceNodes ?? []
        this.depthProps.updateResources(nodes)
        this.depthProps.updateGraves(snapshot.graves ?? [])
        if (this.mapVisibility) updateResourceVisibility(this.mapVisibility, nodes)
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
    }

    public setInteractionTarget(target: TargetHighlight | undefined): void {
        const onMap = target && this.mapBounds.contains(vec(target.position.x, target.position.y))
        this.interactionTarget.set(this.playerPosition && onMap ? target : undefined)
    }

    public isPositionVisible(position: Vector2): boolean {
        return !this.buildingViews.hidesCharacter(position)
    }

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

    public isCharacterVisible(id: string): boolean {
        return this.bundles.get(id)?.body.graphics.isVisible ?? true
    }

    private updateCharacter(snapshot: CharacterSnapshot, isLocalPlayer: boolean): void {
        const bundle = this.getBundle(snapshot)
        bundle.snapshot = snapshot
        positionBundle(bundle, snapshot)
        bundle.label.text = snapshot.nickname
        bundle.label.graphics.opacity = isLocalPlayer ? 0 : snapshot.alive ? 1 : 0.55
        this.updateGraphic(bundle.body, snapshot)
        updateBundleHealth(bundle, snapshot, isLocalPlayer)
        const visible = isLocalPlayer || !this.buildingViews.hidesCharacter(snapshot.position)
        for (const actor of [bundle.body, bundle.label, bundle.hpBack, bundle.hpFill])
            actor.graphics.isVisible = visible
    }

    private getBundle(snapshot: CharacterSnapshot): CharacterBundle {
        const existing = this.bundles.get(snapshot.id)

        if (existing !== undefined) {
            return existing
        }

        const bundle = createBundle()
        this.bundles.set(snapshot.id, bundle)
        this.engine.add(bundle.body)
        this.engine.add(bundle.label)
        this.engine.add(bundle.hpBack)
        this.engine.add(bundle.hpFill)

        return bundle
    }

    private updateGraphic(actor: Actor, snapshot: CharacterSnapshot): void {
        this.characterGraphics.update(
            actor,
            snapshot,
            performance.now() + this.serverClockOffset,
            this.damageFeedback.elapsed(snapshot.id)
        )
    }

    private followLocalPlayer(localPlayerId: string | undefined): void {
        if (localPlayerId === undefined || localPlayerId === this.followedId) {
            return
        }

        const bundle = this.bundles.get(localPlayerId)

        if (bundle === undefined) {
            return
        }

        this.engine.currentScene.camera.clearAllStrategies()
        this.engine.currentScene.camera.zoom = cameraZoom
        this.engine.currentScene.camera.strategy.lockToActor(bundle.body)
        this.engine.currentScene.camera.strategy.limitCameraBounds(this.mapBounds)
        this.followedId = localPlayerId
    }

    private removeMissing(characters: CharacterSnapshot[]): void {
        const liveIds = new Set(characters.map((character) => character.id))

        for (const [id, bundle] of this.bundles) {
            if (!liveIds.has(id)) {
                this.damageFeedback.forget(id)
                removeBundle(this.engine, bundle)
                this.bundles.delete(id)
            }
        }
    }
}
