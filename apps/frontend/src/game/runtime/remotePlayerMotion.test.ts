import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import type { MotionMap } from './motionCollision'
import { RemotePlayerMotion } from './remotePlayerMotion'

function player(x: number, options: Partial<CharacterSnapshot> = {}) {
    return characterFixture('other', {
        position: { x, y: 88 },
        facing: 'right',
        animation: { action: 'walk', startedAt: 1000 },
        ...options,
    })
}

function setup() {
    const map: MotionMap = {
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(32 * 32).fill(false),
    }
    const motion = new RemotePlayerMotion(player(80), 1000)
    motion.frame(1000, 0, 50, map)
    return { motion, map }
}

describe('remote player motion', () => {
    it('interpolates confirmed positions using two nominal ticks of delay', () => {
        const { motion, map } = setup()
        motion.observe(player(85), 1050, map)
        motion.observe(player(90, { facing: 'up' }), 1100, map)
        motion.frame(1100, 100, 50, map)
        expect(motion.position.x).toBe(80)

        motion.frame(1125, 125, 50, map)
        expect(motion.position.x).toBe(82.5)
        const latest = player(90, { facing: 'up' })
        expect(motion.presentation(latest)).toMatchObject({
            facing: 'right',
            animation: latest.animation,
            position: latest.position,
        })

        motion.frame(1200, 200, 50, map)
        expect(motion.position.x).toBe(90)
        motion.frame(2000, 1000, 50, map)
        expect(motion.position.x).toBe(90)
        expect(motion.presentation(latest).animation.action).toBe('idle')
    })

    it('uses the configured tick interval for the delay', () => {
        const { motion, map } = setup()
        motion.observe(player(88), 1040, map)
        motion.frame(1060, 60, 20, map)
        expect(motion.position.x).toBe(84)
    })

    it('resumes from the held position and interpolates a confirmed backward stop', () => {
        const { motion, map } = setup()
        motion.observe(player(85), 1050, map)
        motion.frame(1250, 250, 50, map)
        expect(motion.position.x).toBe(85)

        const stopped = player(82, { animation: { action: 'idle', startedAt: 1070 } })
        motion.observe(stopped, 1100, map)
        expect(motion.position.x).toBe(85)
        motion.frame(1260, 260, 50, map)
        expect(motion.position.x).toBeCloseTo(84.1)
        motion.observe(stopped, 1150, map)
        motion.frame(1270, 270, 50, map)
        expect(motion.position.x).toBeCloseTo(83.2)
        motion.observe(stopped, 1200, map)
        motion.frame(1290, 290, 50, map)
        expect(motion.position.x).toBe(82)
        motion.frame(1370, 370, 50, map)
        expect(motion.position.x).toBe(82)
        expect(motion.presentation(stopped).animation.action).toBe('idle')
    })

    it('pins the played bracket through a burst bigger than the sample queue', () => {
        const { motion, map } = setup()
        motion.observe(player(85), 1050, map)
        motion.frame(1125, 125, 50, map)
        expect(motion.position.x).toBe(82.5)

        for (let index = 2; index <= 12; index++) {
            motion.observe(player(75 + 5 * index), 1000 + 50 * index, map)
        }
        expect(motion.position.x).toBe(82.5)
        motion.frame(1735, 135, 50, map)
        expect(motion.position.x).toBe(84)
        motion.frame(1745, 145, 50, map)
        expect(motion.position.x).toBeGreaterThan(85)
        expect(motion.position.x).toBeLessThan(86)
    })

    it('ignores out-of-order samples and uses the current combat animation and facing', () => {
        const { motion, map } = setup()
        const attack = player(85, {
            facing: 'left',
            animation: { action: 'attack', startedAt: 1050 },
        })
        motion.observe(attack, 1050, map)
        motion.observe(player(200), 1020, map)
        expect(motion.presentation(attack)).toBe(attack)
        motion.frame(1200, 200, 50, map)
        expect(motion.position.x).toBe(85)
    })

    it('applies forced movement and death without playing stale confirmed positions', () => {
        const { motion, map } = setup()
        motion.observe(player(85), 1050, map)
        const dashed = player(120)
        dashed.movement = { ...dashed.movement!, dashing: true }
        motion.observe(dashed, 1100, map, true)
        expect(motion.position.x).toBe(120)
        motion.frame(1225, 225, 50, map)
        expect(motion.position.x).toBe(120)
        expect(motion.presentation(dashed)).toBe(dashed)

        motion.observe(player(125), 1150, map)
        const dead = player(130, { alive: false, animation: { action: 'death', startedAt: 1200 } })
        motion.observe(dead, 1200, map, true)
        expect(motion.position.x).toBe(130)
        expect(motion.presentation(dead)).toBe(dead)
        motion.frame(1400, 400, 50, map)
        expect(motion.position.x).toBe(130)
    })

    it('applies a confirmed discontinuity through an obstacle at its exact endpoint', () => {
        const { motion, map } = setup()
        map.solid[5 * map.width + 6] = true
        motion.observe(player(88), 1050, map)
        motion.observe(player(120), 1100, map)
        expect(motion.position.x).toBe(120)
        motion.frame(1200, 200, 50, map)
        expect(motion.position.x).toBe(120)
    })
})
