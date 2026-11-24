import { Actor, Canvas, Color, Particle } from 'excalibur'

import type { EffectCue } from '../../src/game/runtime/combatEffectPlan'
import { CombatParticles } from '../../src/game/runtime/combatParticles'
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
