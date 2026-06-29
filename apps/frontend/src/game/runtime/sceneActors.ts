import type {
    AttackZone,
    CharacterArchetype,
    CharacterFacing,
    CharacterSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    Actor,
    Canvas,
    Color,
    Engine,
    Font,
    Label,
    Rectangle,
    type SpriteSheet,
    vec,
} from 'excalibur'

import type { CharacterId } from '../assets/characterCatalog'
import { characterCatalog, resolveAnimationRow } from '../assets/characterCatalog'
import { animationFrame } from './animationFrame'
import type { RenderedTiledMap } from './tiledMap'

interface CharacterBundle {
    body: Actor
    hpBack: Actor
    hpFill: Actor
    label: Label
    message: Label
    messageUntil: number
}

const labelFont = new Font({
    color: Color.White,
    family: 'Inter, system-ui, sans-serif',
    size: 8,
})
const messageFont = new Font({
    color: Color.White,
    family: 'Inter, system-ui, sans-serif',
    size: 7,
})
const cameraZoom = 3

export class SceneActors {
    private readonly bundles = new Map<string, CharacterBundle>()
    private readonly engine: Engine
    private readonly sheets: Map<CharacterId, SpriteSheet>
    private attackZoneActors: Actor[] = []
    private followedId: string | undefined
    private serverClockOffset = 0

    public constructor(engine: Engine, sheets: Map<CharacterId, SpriteSheet>) {
        this.engine = engine
        this.sheets = sheets
    }

    public addMap(map: RenderedTiledMap): void {
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
    }

    public update(snapshot: WorldSnapshot, localPlayerId: string | undefined): void {
        this.serverClockOffset = snapshot.serverTime - performance.now()
        this.removeMissing(snapshot.characters)

        for (const character of snapshot.characters) {
            this.updateCharacter(character)
        }

        this.updateAttackZones(snapshot.characters.flatMap((character) => character.attackZones))
        this.followLocalPlayer(localPlayerId)
    }

    public showChat(actorId: string, text: string, durationMs: number): void {
        const bundle = this.bundles.get(actorId)

        if (bundle === undefined) {
            return
        }

        bundle.message.text = text
        bundle.message.graphics.opacity = 1
        bundle.messageUntil = performance.now() + durationMs
    }

    private updateCharacter(snapshot: CharacterSnapshot): void {
        const bundle = this.getBundle(snapshot)
        const position = vec(snapshot.position.x, snapshot.position.y)
        bundle.body.pos = position
        bundle.body.z = snapshot.position.y
        bundle.message.pos = vec(snapshot.position.x - 38, snapshot.position.y - 58)
        bundle.message.z = bundle.body.z + 4
        bundle.label.pos = vec(snapshot.position.x - 28, snapshot.position.y - 44)
        bundle.label.z = bundle.body.z + 3
        bundle.hpBack.pos = vec(snapshot.position.x - 16, snapshot.position.y - 32)
        bundle.hpBack.z = bundle.body.z + 2
        bundle.hpFill.pos = vec(snapshot.position.x - 16, snapshot.position.y - 32)
        bundle.hpFill.z = bundle.body.z + 2
        bundle.label.text = snapshot.nickname
        this.updateGraphic(bundle.body, snapshot)
        this.updateHealth(bundle, snapshot)
        this.updateMessage(bundle)
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
        const characterId = visualId(snapshot.archetype)
        const definition = characterCatalog[characterId]
        const sheet = this.sheets.get(characterId)
        const action = snapshot.animation.action
        const animation = definition.animations[action]
        const row = resolveAnimationRow(animation, toCatalogDirection(snapshot.facing))

        if (sheet === undefined || animation === undefined || row === undefined) {
            return
        }

        const frame = animationFrame(
            animation,
            action,
            performance.now() + this.serverClockOffset,
            snapshot
        )
        actor.graphics.use(sheet.getSprite(frame, row))
        actor.graphics.flipHorizontal = snapshot.facing === 'left'
        actor.graphics.opacity = snapshot.alive ? 1 : 0.55
    }

    private updateHealth(bundle: CharacterBundle, snapshot: CharacterSnapshot): void {
        const width = 32
        const ratio = Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp))
        bundle.hpFill.graphics.use(
            new Rectangle({
                color: ratio > 0.35 ? Color.Green : Color.Red,
                height: 3,
                width: Math.max(1, width * ratio),
            })
        )
        bundle.hpFill.graphics.opacity = snapshot.alive ? 1 : 0.35
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

    private updateAttackZones(zones: AttackZone[]): void {
        for (const actor of this.attackZoneActors) {
            this.engine.remove(actor)
        }

        this.attackZoneActors = zones.map((zone) => this.createAttackZoneActor(zone))

        for (const actor of this.attackZoneActors) {
            this.engine.add(actor)
        }
    }

    private createAttackZoneActor(zone: AttackZone): Actor {
        const width = zone.maxX - zone.minX
        const height = zone.maxY - zone.minY
        const actor = new Actor({
            anchor: vec(0.5, 0.5),
            height,
            pos: vec(zone.minX + width / 2, zone.minY + height / 2),
            width,
            z: 500,
        })
        actor.graphics.use(
            new Rectangle({
                color: Color.fromHex('#ffcf5a'),
                height,
                width,
            })
        )
        actor.graphics.opacity = 0.35

        return actor
    }

    private followLocalPlayer(localPlayerId: string | undefined): void {
        if (localPlayerId === undefined || localPlayerId === this.followedId) {
            return
        }

        const bundle = this.bundles.get(localPlayerId)

        if (bundle === undefined) {
            return
        }

        this.engine.currentScene.camera.zoom = cameraZoom
        this.engine.currentScene.camera.strategy.lockToActor(bundle.body)
        this.followedId = localPlayerId
    }

    private removeMissing(characters: CharacterSnapshot[]): void {
        const liveIds = new Set(characters.map((character) => character.id))

        for (const [id, bundle] of this.bundles) {
            if (!liveIds.has(id)) {
                removeBundle(this.engine, bundle)
                this.bundles.delete(id)
            }
        }
    }
}

function createBundle(): CharacterBundle {
    return {
        body: new Actor({ anchor: vec(0.5, 0.75), height: 48, width: 48 }),
        hpBack: createBar(Color.fromHex('#171717'), 32),
        hpFill: createBar(Color.Green, 32),
        label: new Label({ font: labelFont, text: '' }),
        message: new Label({ font: messageFont, text: '' }),
        messageUntil: 0,
    }
}

function createBar(color: Color, width: number): Actor {
    const actor = new Actor({
        anchor: vec(0, 0.5),
        height: 3,
        width,
    })
    actor.graphics.use(new Rectangle({ color, height: 3, width }))

    return actor
}

function removeBundle(engine: Engine, bundle: CharacterBundle): void {
    engine.remove(bundle.body)
    engine.remove(bundle.message)
    engine.remove(bundle.label)
    engine.remove(bundle.hpBack)
    engine.remove(bundle.hpFill)
}

function visualId(archetype: CharacterArchetype): CharacterId {
    return archetype === 'skeleton' ? 'skeleton' : 'player'
}

function toCatalogDirection(facing: CharacterFacing): 'up' | 'down' | 'left' | 'right' {
    return facing
}
