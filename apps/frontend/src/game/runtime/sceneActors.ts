import type {
    CharacterSnapshot,
    GameEventPayload,
    ItemId,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    Actor,
    BoundingBox,
    Canvas,
    Color,
    Engine,
    type ImageSource,
    Rectangle,
    type SpriteSheet,
    vec,
} from 'excalibur'

import type { CharacterId } from '../assets/characterCatalog'
import { characterCatalog } from '../assets/characterCatalog'
import { AttackZoneViews } from './attackZoneViews'
import { BuildingViews } from './buildingViews'
import { characterFrame } from './characterFrame'
import { type CharacterBundle, createBundle, removeBundle } from './characterViewBundle'
import { DamageFeedback } from './damageFeedback'
import { DepthPropViews } from './depthPropViews'
import { InteractionTargetViews, type TargetHighlight } from './interactionTargetViews'
import { interactionHasLineOfSight, type MapVisibility } from './mapVisibility'
import { SignReadingViews } from './signReadingViews'
import type { RenderedTiledMap } from './tiledMap'
import { WorldSceneActors } from './worldSceneActors'

const cameraZoom = 3

export class SceneActors {
    private readonly bundles = new Map<string, CharacterBundle>()
    private readonly buildingViews: BuildingViews
    private readonly depthProps: DepthPropViews
    private readonly worldActors: WorldSceneActors
    private readonly attackZones: AttackZoneViews
    private readonly interactionTarget: InteractionTargetViews
    private mapVisibility: MapVisibility | undefined
    private playerPosition: Vector2 | undefined
    private mapActor: Actor | undefined
    private mapBounds = new BoundingBox()
    private followedId: string | undefined
    private serverClockOffset = 0
    private localPlayerId: string | undefined
    private readonly damageFeedback: DamageFeedback
    private readonly signReading: SignReadingViews

    public constructor(
        private readonly engine: Engine,
        private readonly sheets: Map<CharacterId, SpriteSheet>,
        itemImages: Map<ItemId, ImageSource>,
        chestImage: ImageSource,
        farmImage: ImageSource
    ) {
        this.interactionTarget = new InteractionTargetViews(engine)
        this.attackZones = new AttackZoneViews(engine)
        this.signReading = new SignReadingViews(engine)
        this.buildingViews = new BuildingViews(engine)
        this.depthProps = new DepthPropViews(engine)
        this.worldActors = new WorldSceneActors(engine, itemImages, chestImage, farmImage)
        this.damageFeedback = new DamageFeedback(
            engine,
            (id) => this.bundles.get(id)?.body,
            (id) => {
                const bundle = this.bundles.get(id)
                if (bundle?.snapshot) this.updateGraphic(bundle.body, bundle.snapshot)
            }
        )
    }

    public clearDamage(): void {
        this.damageFeedback.clear()
    }
    public dispose(): void {
        this.damageFeedback.dispose()
        this.signReading.dispose()
        this.interactionTarget.dispose()
        this.attackZones.update([])
        this.mapVisibility = this.playerPosition = undefined
    }
    public showDamage(event: GameEventPayload): void {
        this.damageFeedback.show(event, event.targetId === this.localPlayerId)
    }

    public addMap(map: RenderedTiledMap): void {
        this.clearDamage()
        this.interactionTarget.clear()
        this.signReading.setMap(map.visibility)
        this.mapVisibility = map.visibility
        this.playerPosition = undefined
        this.mapActor?.kill()
        this.mapBounds = new BoundingBox(0, 0, map.worldWidth, map.worldHeight)
        this.followedId = undefined
        this.depthProps.setProps(map.depthProps)
        this.buildingViews.setBuildings(map.buildings)
        const actor = new Actor({
            anchor: vec(0, 0),
            height: map.worldHeight,
            pos: vec(0, 0),
            width: map.worldWidth,
            z: -100,
        })
        actor.graphics.use(
            new Canvas({
                cache: true,
                draw: (context) => {
                    context.drawImage(map.bitmap, 0, 0)
                },
                height: map.worldHeight,
                smoothing: false,
                width: map.worldWidth,
            })
        )
        this.engine.add(actor)
        this.mapActor = actor
    }

    public update(snapshot: WorldSnapshot, localPlayerId: string | undefined): void {
        if (this.localPlayerId !== localPlayerId) this.interactionTarget.clear()
        this.localPlayerId = localPlayerId
        this.serverClockOffset = snapshot.serverTime - performance.now()
        this.removeMissing(snapshot.characters)
        const player = snapshot.characters.find((character) => character.id === localPlayerId)
        this.playerPosition =
            player?.alive && !player.tags.includes('offline') ? player.position : undefined
        if (!this.playerPosition) this.interactionTarget.clear()
        this.buildingViews.update(player?.position)
        this.signReading.update(snapshot.adventure?.worldObjects ?? [], player, (position) =>
            this.isPositionVisible(position)
        )

        for (const character of snapshot.characters) {
            this.updateCharacter(character, character.id === localPlayerId)
        }

        this.worldActors.update(
            snapshot.items,
            snapshot.chests,
            snapshot.adventure?.resourceNodes,
            snapshot.adventure?.farmPlots,
            snapshot.serverTime
        )
        this.attackZones.update(snapshot.characters.flatMap((character) => character.attackZones))
        this.followLocalPlayer(localPlayerId)
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

    public showChat(actorId: string, text: string, durationMs: number): void {
        const bundle = this.bundles.get(actorId)

        if (bundle === undefined) {
            return
        }

        bundle.message.text = text.length > 96 ? `${text.slice(0, 93).trimEnd()}…` : text
        bundle.message.graphics.opacity = 1
        bundle.messageUntil = performance.now() + durationMs
    }

    private updateCharacter(snapshot: CharacterSnapshot, isLocalPlayer: boolean): void {
        const bundle = this.getBundle(snapshot)
        bundle.snapshot = snapshot
        const position = vec(snapshot.position.x, snapshot.position.y)
        bundle.body.pos = position
        bundle.body.z = snapshot.position.y
        bundle.message.pos = vec(snapshot.position.x, snapshot.position.y - 52)
        bundle.message.z = bundle.body.z + 4
        bundle.label.pos = vec(snapshot.position.x, snapshot.position.y - 44)
        bundle.label.z = bundle.body.z + 3
        bundle.hpBack.pos = vec(snapshot.position.x - 16, snapshot.position.y - 32)
        bundle.hpBack.z = bundle.body.z + 2
        bundle.hpFill.pos = vec(snapshot.position.x - 16, snapshot.position.y - 32)
        bundle.hpFill.z = bundle.body.z + 2
        bundle.label.text = snapshot.nickname
        bundle.label.graphics.opacity = isLocalPlayer ? 0 : snapshot.alive ? 1 : 0.55
        this.updateGraphic(bundle.body, snapshot)
        this.updateHealth(bundle, snapshot, isLocalPlayer)
        this.updateMessage(bundle)
        const visible = isLocalPlayer || !this.buildingViews.hidesCharacter(snapshot.position)
        for (const actor of [
            bundle.body,
            bundle.label,
            bundle.message,
            bundle.hpBack,
            bundle.hpFill,
        ])
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
        this.engine.add(bundle.message)
        this.engine.add(bundle.label)
        this.engine.add(bundle.hpBack)
        this.engine.add(bundle.hpFill)

        return bundle
    }

    private updateGraphic(actor: Actor, snapshot: CharacterSnapshot): void {
        const characterId = snapshot.visualId
        const definition = characterCatalog[characterId]
        const sheet = this.sheets.get(characterId)
        const graphic = characterFrame(
            definition,
            snapshot,
            performance.now() + this.serverClockOffset,
            this.damageFeedback.elapsed(snapshot.id)
        )
        if (sheet === undefined || graphic === undefined) return
        actor.graphics.use(sheet.getSprite(graphic.frame, graphic.row))
        actor.graphics.flipHorizontal = graphic.flipHorizontal
        actor.graphics.opacity = snapshot.alive ? 1 : 0.55
    }

    private updateHealth(
        bundle: CharacterBundle,
        snapshot: CharacterSnapshot,
        isLocalPlayer: boolean
    ): void {
        const width = 32
        const ratio = Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp))
        const opacity = isLocalPlayer ? 0 : snapshot.alive ? 1 : 0.35

        bundle.hpFill.graphics.use(
            new Rectangle({
                color: ratio > 0.35 ? Color.Green : Color.Red,
                height: 3,
                width: Math.max(1, width * ratio),
            })
        )
        bundle.hpBack.graphics.opacity = opacity
        bundle.hpFill.graphics.opacity = opacity
    }

    private updateMessage(bundle: CharacterBundle): void {
        if (bundle.messageUntil > performance.now()) {
            return
        }

        if (bundle.message.text.length > 0) {
            bundle.message.text = ''
            bundle.message.graphics.opacity = 0
        }
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
