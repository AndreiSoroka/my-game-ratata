import type {
    CharacterSnapshot,
    GameEventPayload,
    StopCorrectionRequest,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { type Actor, type Engine, type SpriteSheet } from 'excalibur'

import type { CharacterId } from '../assets/characterCatalog'
import { CharacterGraphics } from './characterGraphics'
import {
    type CharacterBundle,
    positionCharacterBundle,
    removeBundle,
    syncCharacterBundle,
} from './characterViewBundle'
import { DamageFeedback } from './damageFeedback'
import type { MapVisibility } from './mapVisibility'
import { NetworkMotion } from './networkMotion'
import type { SnapshotReference } from './runtimeSnapshotStream'

/** Owns character views and a single pre-camera presentation update for this scene. */
export class SceneCharacterViews {
    private readonly bundles = new Map<string, CharacterBundle>()
    private readonly motion = new NetworkMotion()
    private readonly graphics: CharacterGraphics
    private readonly damage: DamageFeedback
    private disposed = false

    public constructor(
        private readonly engine: Engine,
        sheets: Map<CharacterId, SpriteSheet>,
        private readonly removed: (id: string) => void,
        private readonly placed: () => void
    ) {
        this.graphics = new CharacterGraphics(sheets)
        this.damage = new DamageFeedback(
            engine,
            (id) => this.bundles.get(id)?.body,
            (id) => this.refreshGraphic(id),
            (id) => this.snapshot(id)?.trainingTarget !== undefined
        )
        engine.on('preupdate', this.frame)
        document.addEventListener('visibilitychange', this.visibility)
    }

    public setMap(map: MapVisibility): void {
        this.motion.setMap(map)
    }

    public sync(
        snapshot: WorldSnapshot,
        playerId: string | undefined,
        visible: (character: CharacterSnapshot) => boolean,
        reference?: SnapshotReference
    ): void {
        if (!document.hidden) this.motion.observe(snapshot, performance.now(), playerId, reference)
        this.removeMissing(snapshot.characters)
        for (const character of snapshot.characters) {
            syncCharacterBundle(
                this.engine,
                this.bundles,
                character,
                character.id === playerId,
                visible(character),
                this.motion.position(character.id) ?? character.position
            )
            this.refreshGraphic(character.id)
        }
    }

    public receive(event: GameEventPayload, local: boolean): void {
        this.motion.event(event)
        this.damage.show(event, local)
    }

    public snapshot(id: string): CharacterSnapshot | undefined {
        return this.bundles.get(id)?.snapshot
    }

    public body(id: string): Actor | undefined {
        return this.bundles.get(id)?.body
    }

    public position(id: string): Vector2 | undefined {
        const body = this.body(id)
        return body ? { x: body.pos.x, y: body.pos.y } : undefined
    }

    public visible(id: string): boolean {
        return this.body(id)?.graphics.isVisible ?? false
    }

    public rendered(): { id: string; position: Vector2 }[] {
        return [...this.bundles].map(([id, bundle]) => ({
            id,
            position: { x: bundle.body.pos.x, y: bundle.body.pos.y },
        }))
    }

    public resetMotion(): void {
        this.motion.reset()
    }

    public holdMotion(): void {
        this.motion.hold()
    }

    public beginStop(id: string, requestId: number): StopCorrectionRequest | undefined {
        const request = this.motion.beginStop(id, requestId, performance.now())
        if (request) this.refreshGraphic(id)
        return request
    }

    public cancelStop(): void {
        this.motion.cancelStop()
    }

    public clearDamage(): void {
        this.damage.clear()
        this.motion.reset()
    }

    public dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.engine.off('preupdate', this.frame)
        document.removeEventListener('visibilitychange', this.visibility)
        this.damage.dispose()
        this.motion.reset()
        for (const bundle of this.bundles.values()) removeBundle(this.engine, bundle)
        this.bundles.clear()
    }

    private readonly frame = (): void => {
        if (this.disposed || document.hidden) return
        const time = performance.now()
        this.motion.frame(time)
        for (const [id, bundle] of this.bundles) {
            const snapshot = this.motion.presentation(id, time) ?? idleSnapshot(bundle.snapshot)
            const position = this.motion.position(id)
            if (!snapshot) continue
            if (position) positionCharacterBundle(bundle, position, snapshot)
            this.updateGraphic(bundle, snapshot, time)
        }
        this.placed()
    }

    private readonly visibility = (): void => this.motion.reset()

    private refreshGraphic(id: string): void {
        const bundle = this.bundles.get(id)
        const time = performance.now()
        const snapshot = this.motion.presentation(id, time) ?? bundle?.snapshot
        if (bundle && snapshot) this.updateGraphic(bundle, snapshot, time)
    }

    private updateGraphic(
        bundle: CharacterBundle,
        snapshot: CharacterSnapshot,
        time: number
    ): void {
        this.graphics.update(
            bundle.body,
            snapshot,
            this.motion.serverTime(time),
            this.damage.elapsed(snapshot.id)
        )
    }

    private removeMissing(characters: CharacterSnapshot[]): void {
        const active = new Set(characters.map((character) => character.id))
        for (const [id, bundle] of this.bundles) {
            if (active.has(id)) continue
            this.damage.forget(id)
            this.removed(id)
            removeBundle(this.engine, bundle)
            this.bundles.delete(id)
        }
    }
}

function idleSnapshot(snapshot: CharacterSnapshot | undefined): CharacterSnapshot | undefined {
    return snapshot?.animation.action === 'walk'
        ? { ...snapshot, animation: { ...snapshot.animation, action: 'idle' } }
        : snapshot
}
