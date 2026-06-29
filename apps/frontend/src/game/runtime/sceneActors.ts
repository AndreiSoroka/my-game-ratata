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
    ImageSource,
    Label,
    Loader,
    Rectangle,
    SpriteSheet,
    vec,
} from 'excalibur'

import {
    characterCatalog,
    type CharacterDefinition,
    type CharacterId,
    clampFrame,
    resolveAnimationRow,
} from '../assets/characterCatalog'
import type { RenderedTiledMap } from './tiledMap'

interface CharacterBundle {
    body: Actor
    hpBack: Actor
    hpFill: Actor
    label: Label
}

export interface CharacterResources {
    loader: Loader
    sheets: Map<CharacterId, SpriteSheet>
}

const labelFont = new Font({
    color: Color.White,
    family: 'Inter, system-ui, sans-serif',
    size: 8,
})
const cameraZoom = 3

export function createCharacterResources(): CharacterResources {
    const images = new Map<CharacterId, ImageSource>()
    const sheets = new Map<CharacterId, SpriteSheet>()

    for (const definition of Object.values(characterCatalog)) {
        const image = new ImageSource(definition.src)
        images.set(definition.id, image)
        sheets.set(definition.id, createSheet(definition, image))
    }

    return {
        loader: new Loader([...images.values()]),
        sheets,
    }
}

export class SceneActors {
    private readonly bundles = new Map<string, CharacterBundle>()
    private readonly engine: Engine
    private readonly sheets: Map<CharacterId, SpriteSheet>
    private attackZoneActors: Actor[] = []
    private followedId: string | undefined

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
        this.removeMissing(snapshot.characters)

        for (const character of snapshot.characters) {
            this.updateCharacter(character)
        }

        this.updateAttackZones(snapshot.characters.flatMap((character) => character.attackZones))
        this.followLocalPlayer(localPlayerId)
    }

    private updateCharacter(snapshot: CharacterSnapshot): void {
        const bundle = this.getBundle(snapshot)
        const position = vec(snapshot.position.x, snapshot.position.y)
        bundle.body.pos = position
        bundle.body.z = snapshot.position.y
        bundle.label.pos = vec(snapshot.position.x - 28, snapshot.position.y - 44)
        bundle.hpBack.pos = vec(snapshot.position.x - 16, snapshot.position.y - 32)
        bundle.hpFill.pos = vec(snapshot.position.x - 16, snapshot.position.y - 32)
        bundle.label.text = snapshot.nickname
        this.updateGraphic(bundle.body, snapshot)
        this.updateHealth(bundle, snapshot)
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
        const characterId = visualId(snapshot.archetype)
        const definition = characterCatalog[characterId]
        const sheet = this.sheets.get(characterId)
        const action = snapshotAction(snapshot)
        const animation = definition.animations[action]
        const row = resolveAnimationRow(animation, toCatalogDirection(snapshot.facing))

        if (sheet === undefined || animation === undefined || row === undefined) {
            return
        }

        const frame = clampFrame(animation, Math.floor(performance.now() / animation.frameMs))
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

function createSheet(definition: CharacterDefinition, image: ImageSource): SpriteSheet {
    return SpriteSheet.fromImageSource({
        grid: {
            columns: definition.columns,
            rows: definition.rows,
            spriteHeight: definition.spriteHeight,
            spriteWidth: definition.spriteWidth,
        },
        image,
    })
}

function createBundle(): CharacterBundle {
    return {
        body: new Actor({ anchor: vec(0.5, 0.75), height: 48, width: 48 }),
        hpBack: createBar(Color.fromHex('#171717'), 32),
        hpFill: createBar(Color.Green, 32),
        label: new Label({ font: labelFont, text: '' }),
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
    engine.remove(bundle.label)
    engine.remove(bundle.hpBack)
    engine.remove(bundle.hpFill)
}

function snapshotAction(
    snapshot: CharacterSnapshot
): 'idle' | 'walk' | 'attack' | 'damaged' | 'death' {
    if (!snapshot.alive) {
        return 'death'
    }

    if (snapshot.attackZones.length > 0) {
        return 'attack'
    }

    if (snapshot.cooldowns.stunMsLeft > 0) {
        return 'damaged'
    }

    return snapshot.velocity.x !== 0 || snapshot.velocity.y !== 0 ? 'walk' : 'idle'
}

function visualId(archetype: CharacterArchetype): CharacterId {
    return archetype === 'skeleton' ? 'skeleton' : 'player'
}

function toCatalogDirection(facing: CharacterFacing): 'up' | 'down' | 'left' | 'right' {
    return facing
}
