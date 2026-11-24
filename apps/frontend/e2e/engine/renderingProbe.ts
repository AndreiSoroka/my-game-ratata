import type { MagicEffectSnapshot } from '@my-game-ratata/contracts'
import { Actor, Canvas, Color, ImageSource, Particle } from 'excalibur'

import type { EffectCue } from '../../src/game/runtime/combatEffectPlan'
import { CombatParticles } from '../../src/game/runtime/combatParticles'
import { MagicViews } from '../../src/game/runtime/magicViews'
import { worldFixture } from '../../src/game/testing/characterFixture'
import { capture, mountEngine, pixel, startEngine, type TestEngine } from './engineSupport'

const roadCue = {
    kind: 'devotion',
    fromId: 'source',
    targetId: 'source',
    deity: 'road',
    color: '#9dd17d',
    duration: 550,
    count: 12,
} satisfies EffectCue

function particlesIn(run: TestEngine): Particle[] {
    return run.engine.currentScene.world.entities.filter((entity) => entity instanceof Particle)
}

function roadPixels(image: ImageData): number {
    let count = 0
    for (let y = 35; y < 75; y++) {
        for (let x = 28; x < 90; x++) {
            const [r = 0, g = 0, b = 0] = pixel(image, x, y)
            if (g > r + 10 && g > b + 10) count++
        }
    }
    return count
}

export async function verifyRendering() {
    const run = mountEngine()
    const { engine, clock, owner } = run
    try {
        await startEngine(run)
        const cover = new Actor({ x: 60, y: 54, width: 70, height: 42, z: 78, color: Color.Blue })
        engine.add(cover)

        const particles = new CombatParticles(engine, false)
        particles.burst(roadCue, { x: 48, y: 54 }, clock.now())
        const active = particlesIn(run)
        const initialX = active.map((particle) => particle.transform.pos.x)
        const depth = [...new Set(active.map((particle) => particle.transform.z))]
        clock.run(5)
        const movedRight = active.every(
            (particle, index) => particle.transform.pos.x > (initialX[index] ?? Infinity)
        )
        const visible = roadPixels(await capture(run))
        cover.z = 80
        const occluded = roadPixels(await capture(run))

        clock.run(36)
        particles.update(clock.now())
        await capture(run)
        const expired = particlesIn(run).length

        particles.burst(roadCue, { x: 48, y: 54 }, clock.now())
        clock.step()
        particles.clear()
        clock.run(2)
        const released = particlesIn(run).length
        const textureColors = await drawDynamicTexture(run)

        return {
            ...run.contextStatus(),
            active: active.length,
            depth,
            movedRight,
            visible,
            occluded,
            expired,
            released,
            textureColors,
        }
    } finally {
        await owner.cancel()
    }
}

async function drawDynamicTexture(run: TestEngine): Promise<number[][]> {
    let color = '#c03020'
    const graphic = new Canvas({
        width: 12,
        height: 12,
        cache: true,
        smoothing: false,
        draw(ctx) {
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 12, 12)
        },
    })
    const texture = new Actor({ x: 118, y: 54, z: 100 })
    texture.graphics.use(graphic)
    run.engine.add(texture)
    const first = pixel(await capture(run), 118, 54)
    color = '#2090cc'
    graphic.flagDirty()
    return [first, pixel(await capture(run), 118, 54)]
}

export async function verifyAshExhaustionRendering() {
    const run = mountEngine()
    const views = new MagicViews(
        run.engine,
        new ImageSource('/game/assets/world/magic/fire-spells.png')
    )
    run.owner.addCleanup(() => views.dispose())
    const flight = {
        id: 'ash:flight',
        abilityId: 'ash_exhaustion',
        phase: 'flight',
        position: { x: 44, y: 60 },
        direction: { x: 1, y: 0 },
        radius: 5,
        expiresAt: 10_000,
    } satisfies MagicEffectSnapshot
    const sync = (effect: MagicEffectSnapshot, at: number, visible = true) =>
        views.sync({ ...worldFixture([], at), magicEffects: [effect] }, () => visible)
    try {
        await startEngine(run)
        sync(flight, 1000)
        const start = await capture(run)
        const moved = { ...flight, position: { x: 112, y: 60 } }
        sync(moved, 1080)
        const end = await capture(run)
        sync({ ...moved, phase: 'impact' }, 1160)
        const impact = await capture(run)
        sync(moved, 1240, false)
        const hidden = await capture(run)
        sync(moved, moved.expiresAt)
        const expired = await capture(run)
        return {
            ...run.contextStatus(),
            start: ashPixels(start, 44),
            moved: ashPixels(end, 112),
            noTrail: ashPixels(end, 44) === 0,
            impact: ashPixels(impact, 112),
            noFlightTailOnImpact: ashPixels(impact, 112, -20, -12) === 0,
            hidden: ashPixels(hidden, 112) === 0,
            expired: ashPixels(expired, 112) === 0,
        }
    } finally {
        await run.owner.cancel()
    }
}

function ashPixels(image: ImageData, center: number, left = -20, right = 20): number {
    let count = 0
    for (let x = center + left; x <= center + right; x += 1) {
        for (let y = 40; y <= 80; y += 1) {
            const [r = 0, g = 0, b = 0] = pixel(image, x, y)
            if (r > g + 10 && b > r + 8) count += 1
        }
    }
    return count
}
