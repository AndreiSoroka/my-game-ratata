import {
    type CharacterSnapshot,
    PORTABLE_LIGHT_RADIUS,
    type Vector2,
    type ViewportBounds,
} from '@my-game-ratata/contracts'
import { Canvas, type Engine, type PostDrawEvent } from 'excalibur'

import { dungeonLightPath } from './dungeonShadow'
import type { DungeonLight } from './mapDungeonLights'
import type { MapVisibility } from './mapVisibility'

const maxMaskSize = 480
const maxCarriedLights = 24
const footingRadius = 24
const portalRadius = 34
const shade = 'rgba(4, 3, 8, 0.985)'

interface LightMask extends DungeonLight {
    path?: Path2D
    strength: number
    cool?: boolean
}

interface DungeonFrame {
    bounds: ViewportBounds
    observer: Vector2 | undefined
    lights: LightMask[]
}

/** Draw after all world-space effects so floating labels and markers share the same darkness. */
export class SceneDungeonLighting {
    private visibility: MapVisibility | undefined
    private wallLights: LightMask[] = []
    private carriedLights: Pick<CharacterSnapshot, 'id' | 'lightSource'>[] = []
    private playerId: string | undefined
    private mask: Canvas | undefined
    private frame: DungeonFrame | undefined
    private signature: string | undefined

    public constructor(
        private readonly engine: Engine,
        private readonly positionOf: (id: string) => Vector2 | undefined,
        private readonly portalPositions: () => Vector2[] = () => []
    ) {}

    public setMap(lights: readonly DungeonLight[] | undefined, visibility: MapVisibility): void {
        this.dispose()
        if (!lights) return

        this.visibility = visibility
        this.wallLights = lights.map((light) => ({
            ...light,
            strength: 0.98,
        }))
        this.refreshOcclusion()
        this.mask = new Canvas({ width: 1, height: 1, cache: true, draw: this.rasterize })
        this.engine.on('postdraw', this.draw)
    }

    public refreshOcclusion(): void {
        if (!this.visibility) return
        for (const light of this.wallLights)
            light.path = dungeonLightPath(this.visibility, light, light.radius)
        this.signature = undefined
    }

    public sync(characters: readonly CharacterSnapshot[], playerId: string | undefined): void {
        if (!this.visibility) return
        this.playerId = playerId
        this.carriedLights = characters.filter(({ alive, lightSource }) => alive && lightSource)
    }

    public dispose(): void {
        if (this.visibility) this.engine.off('postdraw', this.draw)
        this.visibility = this.mask = this.frame = this.signature = this.playerId = undefined
        this.wallLights = this.carriedLights = []
    }

    private readonly draw = ({ ctx }: PostDrawEvent): void => {
        const mask = this.mask
        if (!mask) return
        const bounds = this.engine.screen.getWorldBounds()
        const { width, height } = this.engine.screen.resolution
        if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return
        this.updateMask(mask, bounds)

        ctx.save()
        ctx.z = 20_000
        ctx.scale(width / mask.width, height / mask.height)
        mask.draw(ctx, 0, 0)
        ctx.restore()
    }

    private updateMask(
        mask: Canvas,
        bounds: ViewportBounds & { width: number; height: number }
    ): void {
        const observer = this.playerId ? this.positionOf(this.playerId) : undefined
        const carried = this.visibleCarriedLights(bounds, observer)
        const portals = this.portalPositions()
            .map((position) => ({ ...position, radius: portalRadius, strength: 0.92, cool: true }))
            .filter((light) => intersectsView(light, bounds))
        const scale = Math.min(1, maxMaskSize / Math.max(bounds.width, bounds.height))
        const maskWidth = Math.ceil(bounds.width * scale)
        const maskHeight = Math.ceil(bounds.height * scale)
        const signature = JSON.stringify([
            maskWidth,
            maskHeight,
            bounds.left,
            bounds.top,
            bounds.right,
            bounds.bottom,
            observer,
            carried,
            portals,
        ])
        if (signature === this.signature) return

        this.signature = signature
        if (mask.width !== maskWidth) mask.width = maskWidth
        if (mask.height !== maskHeight) mask.height = maskHeight
        this.frame = {
            bounds,
            observer,
            lights: [
                ...this.wallLights.filter((light) => intersectsView(light, bounds)),
                ...carried,
                ...portals,
            ],
        }
        mask.flagDirty()
    }

    private visibleCarriedLights(
        bounds: ViewportBounds,
        observer: Vector2 | undefined
    ): LightMask[] {
        const carried: LightMask[] = []
        for (const { id, lightSource } of this.carriedLights) {
            const position = this.positionOf(id)
            if (!position || !lightSource) continue
            const light = {
                ...position,
                radius: PORTABLE_LIGHT_RADIUS[lightSource],
                strength: 0.98,
            }
            if (intersectsView(light, bounds)) carried.push(light)
        }
        // Limit the work using the closest lights first and always keep the observer's own light.
        if (observer && carried.length > maxCarriedLights)
            carried.sort((a, b) => distanceSquared(a, observer) - distanceSquared(b, observer))
        return carried.slice(0, maxCarriedLights)
    }

    private readonly rasterize = (context: CanvasRenderingContext2D): void => {
        const { frame, mask, visibility } = this
        if (!frame || !mask || !visibility) return
        const { bounds, observer, lights } = frame
        context.fillStyle = shade
        context.fillRect(0, 0, mask.width, mask.height)
        if (!observer) return

        const width = bounds.right - bounds.left
        const height = bounds.bottom - bounds.top
        context.scale(mask.width / width, mask.height / height)
        context.translate(-bounds.left, -bounds.top)
        const viewRadius = Math.hypot(
            Math.max(Math.abs(observer.x - bounds.left), Math.abs(observer.x - bounds.right)),
            Math.max(Math.abs(observer.y - bounds.top), Math.abs(observer.y - bounds.bottom))
        )
        context.clip(dungeonLightPath(visibility, observer, viewRadius))
        context.globalCompositeOperation = 'destination-out'

        // Just enough reflected light to orient oneself and find the ladder without equipment.
        revealLight(context, { ...observer, radius: footingRadius, strength: 0.28 })
        for (const light of lights) revealLight(context, light, visibility)
    }
}

function intersectsView({ x, y, radius }: DungeonLight, bounds: ViewportBounds): boolean {
    return (
        x + radius >= bounds.left &&
        x - radius <= bounds.right &&
        y + radius >= bounds.top &&
        y - radius <= bounds.bottom
    )
}

function distanceSquared(a: Vector2, b: Vector2): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

function revealLight(
    context: CanvasRenderingContext2D,
    light: LightMask,
    visibility?: MapVisibility
): void {
    const { x, y, radius, strength } = light
    const halo = context.createRadialGradient(x, y, 0, x, y, radius)
    halo.addColorStop(0, `rgba(0, 0, 0, ${strength})`)
    halo.addColorStop(0.28, `rgba(0, 0, 0, ${strength * 0.93})`)
    halo.addColorStop(0.7, `rgba(0, 0, 0, ${strength * 0.34})`)
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.save()
    if (visibility) context.clip(light.path ?? dungeonLightPath(visibility, light, radius))
    context.fillStyle = halo
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    if (light.cool) {
        const glow = context.createRadialGradient(x, y, 0, x, y, radius)
        glow.addColorStop(0, 'rgba(106, 160, 255, 0.30)')
        glow.addColorStop(1, 'rgba(106, 160, 255, 0)')
        context.globalCompositeOperation = 'source-over'
        context.fillStyle = glow
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
    context.restore()
}
