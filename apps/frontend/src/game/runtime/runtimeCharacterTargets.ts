import type { CharacterSnapshot, Vector2, WorldSnapshot } from '@my-game-ratata/contracts'
import { Color, DisplayMode, Engine, PointerScope, vec } from 'excalibur'

export function characterAt(
    snapshot: WorldSnapshot | undefined,
    playerId: string | undefined,
    point: Vector2,
    visible: (id: string) => boolean
): string | undefined {
    return snapshot?.characters
        .filter((actor) => actor.id !== playerId && visible(actor.id))
        .map((actor) => ({
            id: actor.id,
            distance: Math.hypot(actor.position.x - point.x, actor.position.y - point.y),
        }))
        .filter((actor) => actor.distance <= 24)
        .sort((a, b) => a.distance - b.distance)[0]?.id
}
export function projectCharacter(
    engine: Engine | undefined,
    canvas: HTMLCanvasElement | undefined,
    snapshot: WorldSnapshot | undefined,
    id: string
) {
    const character = snapshot?.characters.find((actor) => actor.id === id)
    if (!character || !engine || !canvas) return undefined
    return projectPosition(
        engine,
        canvas,
        {
            x: character.position.x,
            y: character.position.y - 42,
        },
        true
    )
}
export function projectPosition(
    engine: Engine | undefined,
    canvas: HTMLCanvasElement | undefined,
    position: Vector2,
    clip = false
) {
    if (!engine || !canvas) return undefined
    const point = engine.worldToScreenCoordinates(vec(position.x, position.y))
    const rect = canvas.getBoundingClientRect()
    if (clip && (point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height))
        return undefined
    const parent = canvas.closest('.game-screen')?.getBoundingClientRect() ?? rect
    return {
        x: point.x + rect.left - parent.left,
        y: point.y + rect.top - parent.top,
        width: parent.width,
        height: parent.height,
    }
}

export function createGameCanvas(container: HTMLElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.className = 'game-canvas'
    canvas.dataset.gameCanvas = 'true'
    canvas.tabIndex = 0
    container.append(canvas)
    return canvas
}

export function characterDisrupted(player: CharacterSnapshot | undefined): boolean {
    return player !== undefined && (!player.alive || player.cooldowns.stunMsLeft > 0)
}

export function createGameEngine(canvas: HTMLCanvasElement): Engine {
    return new Engine({
        backgroundColor: Color.fromHex('#0b0d0c'),
        canvasElement: canvas,
        displayMode: DisplayMode.FillContainer,
        pixelArt: true,
        pointerScope: PointerScope.Canvas,
        suppressPlayButton: true,
    })
}
