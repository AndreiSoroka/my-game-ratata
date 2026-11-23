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
import { type BellImages, BellViews } from './bellViews'
import { BuildingViews } from './buildingViews'
import { CharacterGraphics } from './characterGraphics'
import { type CharacterBundle, removeBundle, syncCharacterBundle } from './characterViewBundle'
import { CombatEffects } from './combatEffects'
import { CorpseViews } from './corpseViews'
import { DamageFeedback } from './damageFeedback'
import { DepthPropViews } from './depthPropViews'
import { FootstepViews } from './footstepViews'
import { InteractionTargetViews, type TargetHighlight } from './interactionTargetViews'
import type { MagicViews } from './magicViews'
import {
    interactionHasLineOfSight,
    type MapVisibility,
    updateResourceVisibility,
} from './mapVisibility'
import type { PrayerAreaViews } from './prayerAreaViews'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { RouteWaypointViews } from './routeWaypointViews'
import { SceneMapView } from './sceneMapActor'
import { SignReadingViews } from './signReadingViews'
import { StatusViews } from './statusViews'
import type { RenderedTiledMap } from './tiledMap'
import { observerTrainingArea, TrainingGuides } from './trainingGuides'
import { WorldSceneActors } from './worldSceneActors'

export class SceneActors {
    private readonly bundles = new Map<string, CharacterBundle>()
    private gravePositions = new Map<string, Vector2>()
    private readonly buildingViews: BuildingViews
    private readonly bells: BellViews
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
    private readonly mapView: SceneMapView
    private mapBounds = new BoundingBox()
    private serverClockOffset = 0
    private localPlayerId: string | undefined
    private readonly statusViews: StatusViews
    private readonly footsteps: FootstepViews
    private readonly combatEffects: CombatEffects
    private readonly damageFeedback: DamageFeedback
    private readonly signReading: SignReadingViews
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
        this.mapView = new SceneMapView(engine)
        this.bells = new BellViews(engine, bellImages)
        this.characterGraphics = new CharacterGraphics(sheets)
        this.guides = new TrainingGuides(engine)
        const characterVisible = (id: string) => this.isCharacterVisible(id)
        this.combatTarget = new InteractionTargetViews(engine, characterVisible)
        this.interactionTarget = new InteractionTargetViews(engine, characterVisible)
        this.signReading = new SignReadingViews(engine)
        this.routeWaypoints = new RouteWaypointViews(engine)
        this.buildingViews = new BuildingViews(engine)
        this.depthProps = new DepthPropViews(engine)
        this.corpseViews = new CorpseViews(engine, sheets)
        this.worldActors = new WorldSceneActors(engine, itemImages, chestImage, farmImage)
        this.statusViews = new StatusViews(engine)
        this.footsteps = new FootstepViews(engine, itemImages.get('boots'))
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
        this.magicViews.clear()
        this.prayerAreas.clear()
        this.statusViews.clear()
        this.footsteps.clear()
    }
    public dispose(): void {
        this.bells.clear()
        this.mapView.dispose()
        this.guides.dispose()
        this.corpseViews.dispose()
        this.depthProps.dispose()
        this.damageFeedback.dispose()
        this.combatEffects.dispose()
        this.magicViews.dispose()
        this.prayerAreas.clear()
        this.statusViews.dispose()
        this.footsteps.dispose()
        this.signReading.dispose()
        this.routeWaypoints.dispose()
        this.interactionTarget.dispose()
        this.combatTarget.dispose()
        this.mapVisibility?.resourceInterest?.clear()
        this.mapVisibility = this.playerPosition = undefined
        this.gravePositions.clear()
    }
    public showDamage(event: GameEventPayload): void {
        this.bells.receive(event)
        this.combatEffects.receive(event)
        this.damageFeedback.show(event, event.targetId === this.localPlayerId)
    }

    public addMap(map: RenderedTiledMap): void {
        this.bells.clear()
        this.clearDamage()
        this.corpseViews.dispose()
        this.depthProps.dispose()
        this.interactionTarget.clear()
        this.combatTarget.clear()
        this.routeWaypoints.clear()
        this.signReading.setMap(map.visibility)
        this.trainingAreas = map.training.areas
        this.mapVisibility?.resourceInterest?.clear()
        this.mapVisibility = map.visibility
        this.playerPosition = undefined
        this.gravePositions.clear()
        this.mapBounds = new BoundingBox(0, 0, map.worldWidth, map.worldHeight)
        this.mapView.setMap(map)
        this.depthProps.setProps(map.depthProps, map.harvestGraphics)
        this.buildingViews.setBuildings(map.buildings)
    }

    public update(snapshot: WorldSnapshot, localPlayerId: string | undefined): void {
        if (this.localPlayerId !== localPlayerId) this.interactionTarget.clear()
        this.localPlayerId = localPlayerId
        this.updateResourceViews(snapshot)
        this.serverClockOffset = snapshot.serverTime - performance.now()
        this.removeMissing(snapshot.characters)
        const player = snapshot.characters.find((character) => character.id === localPlayerId)
        this.updateObserver(player, snapshot)
        this.routeWaypoints.updateSnapshot(snapshot, player, this.isPositionVisible)
        this.buildingViews.update(player?.position)
        this.magicViews.sync(snapshot, this.isPositionVisible)
        this.bells.updateSnapshot(snapshot, (bell) => this.isPositionVisible(bell.position))
        this.signReading.update(
            snapshot.adventure?.worldObjects ?? [],
            player,
            this.isPositionVisible
        )

        for (const character of snapshot.characters) {
            const isLocal = character.id === localPlayerId
            const bundle = syncCharacterBundle(
                this.engine,
                this.bundles,
                character,
                isLocal,
                isLocal || this.isPositionVisible(character.position)
            )
            this.updateGraphic(bundle.body, character)
        }

        const visibleCharacters = snapshot.characters.filter((character) =>
            this.isCharacterVisible(character.id)
        )
        this.statusViews.sync(visibleCharacters)
        this.combatEffects.sync(visibleCharacters)
        this.prayerAreas.sync(visibleCharacters, snapshot.serverTime)
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
            },
            player
        )
        this.followLocalPlayer(localPlayerId)
    }

    public buildingCoverStates(): { id: string; visible: boolean }[] {
        return this.buildingViews.coverStates()
    }

    public readonly prayerAreaStates = () => this.prayerAreas.states()
    public readonly heardFootstepIds = () => this.footsteps.ids()
    public readonly characterOpacity = (id: string) =>
        this.isCharacterVisible(id) ? this.bundles.get(id)?.body.graphics.opacity : undefined

    private updateResourceViews(snapshot: WorldSnapshot): void {
        this.gravePositions = new Map(
            (snapshot.graves ?? []).map((grave) => [grave.id, grave.position])
        )
        const nodes = snapshot.adventure?.resourceNodes ?? []
        this.depthProps.updateResources(nodes, snapshot.viewBounds)
        this.depthProps.updateGraves(snapshot.graves ?? [], snapshot.viewBounds)
        if (this.mapVisibility)
            updateResourceVisibility(this.mapVisibility, nodes, snapshot.viewBounds)
    }

    private updateObserver(player: CharacterSnapshot | undefined, snapshot: WorldSnapshot): void {
        this.playerPosition =
            player?.alive && !player.tags.includes('offline') ? player.position : undefined
        if (!this.playerPosition) this.interactionTarget.clear()
        this.footsteps.sync(snapshot, this.playerPosition !== undefined, this.mapBounds.bottom + 32)
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

    public characterPosition(id: string): Vector2 | undefined {
        const body = this.bundles.get(id)?.body
        return body ? { x: body.pos.x, y: body.pos.y } : undefined
    }

    public isCharacterVisible(id: string): boolean {
        return this.bundles.get(id)?.body.graphics.isVisible ?? false
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
        const bundle = localPlayerId ? this.bundles.get(localPlayerId) : undefined
        if (bundle) this.mapView.follow(bundle.body)
    }

    private removeMissing(characters: CharacterSnapshot[]): void {
        const liveIds = new Set(characters.map((character) => character.id))

        for (const [id, bundle] of this.bundles) {
            if (!liveIds.has(id)) {
                this.damageFeedback.forget(id)
                this.combatEffects.forgetCharacter(id)
                this.combatTarget.forgetCharacter(id)
                this.interactionTarget.forgetCharacter(id)
                removeBundle(this.engine, bundle)
                this.bundles.delete(id)
            }
        }
    }
}
