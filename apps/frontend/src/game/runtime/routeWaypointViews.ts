import type {
    CharacterRouteSnapshot,
    CharacterSnapshot,
    MarkerDefinition,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

interface MarkerView {
    actor: Actor
    label: string
}

/** Numbered intentions from the server, independent of the current A* path. */
export class RouteWaypointViews {
    private readonly views = new Map<string, MarkerView>()
    private disposed = false

    public constructor(private readonly engine: Engine) {}

    public updateSnapshot(
        snapshot: WorldSnapshot,
        player: CharacterSnapshot | undefined,
        visible: (position: Vector2) => boolean
    ): void {
        this.update(
            player?.alive ? player.control?.route : undefined,
            snapshot.automation?.markers ?? [],
            snapshot.location?.id,
            visible
        )
    }

    public update(
        route: CharacterRouteSnapshot | undefined,
        markers: readonly MarkerDefinition[],
        locationId: string | undefined,
        visible: (position: Vector2) => boolean
    ): void {
        if (this.disposed) return
        const entries = [
            ...(route && route.locationId === locationId
                ? route.points.map((point, index) => ({
                      key: `route:${String(point.number)}`,
                      label: String(point.number),
                      position: point.position,
                      active: index === 0,
                      blocked: index === 0 && route.waiting === 'blocked',
                      saved: false,
                  }))
                : []),
            ...markers
                .filter((marker) => marker.locationId === locationId)
                .map((marker) => ({
                    key: `saved:${marker.id}`,
                    label: `N${String(marker.number)}`,
                    position: marker.position,
                    active: false,
                    blocked: false,
                    saved: true,
                })),
        ]
        const kept = new Set(entries.map((entry) => entry.key))
        for (const [key, view] of this.views) {
            if (!kept.has(key)) {
                view.actor.kill()
                this.views.delete(key)
            }
        }
        for (const entry of entries) {
            let view = this.views.get(entry.key)
            const label = `${entry.label}:${String(entry.active)}:${String(entry.saved)}:${String(entry.blocked)}`
            if (!view) {
                view = { actor: new Actor({ anchor: vec(0.5, 1) }), label: '' }
                this.engine.add(view.actor)
                this.views.set(entry.key, view)
            }
            if (view.label !== label) {
                view.actor.graphics.use(
                    markerGraphic(entry.label, entry.active, entry.saved, entry.blocked)
                )
                view.label = label
            }
            view.actor.pos = vec(entry.position.x, entry.position.y)
            view.actor.z = entry.position.y + 4
            view.actor.graphics.isVisible = visible(entry.position)
        }
    }

    public clear(): void {
        for (const view of this.views.values()) view.actor.kill()
        this.views.clear()
    }

    public dispose(): void {
        this.clear()
        this.disposed = true
    }
}

function markerGraphic(label: string, active: boolean, saved: boolean, blocked: boolean): Canvas {
    return new Canvas({
        width: 24,
        height: 26,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.fillStyle = saved ? '#213d43ee' : '#302d24ee'
            context.strokeStyle = saved
                ? '#97e2da'
                : blocked
                  ? '#ff9c80'
                  : active
                    ? '#ffe5a2'
                    : '#c8ba94'
            context.lineWidth = active ? 2 : 1
            context.beginPath()
            context.arc(12, 11, 9, 0, Math.PI * 2)
            context.fill()
            context.stroke()
            context.beginPath()
            context.moveTo(9, 20)
            context.lineTo(12, 25)
            context.lineTo(15, 20)
            context.fill()
            context.stroke()
            context.fillStyle = '#fff2cf'
            context.font = `bold ${saved ? '8' : '10'}px sans-serif`
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(label, 12, 11)
            if (blocked) {
                context.beginPath()
                context.arc(19, 4, 4, 0, Math.PI * 2)
                context.fillStyle = '#45251d'
                context.fill()
                context.stroke()
                context.fillStyle = '#fff2cf'
                context.font = 'bold 8px sans-serif'
                context.fillText('!', 19, 4)
            }
        },
    })
}
