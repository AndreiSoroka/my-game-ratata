import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterCatalog } from '../assets/characterCatalog'
import { characterFrame } from './characterFrame'
import { DamageTimeline, hurtPoseMs, maxDamageEffects } from './damagePresentation'

function fighter(alive = true): CharacterSnapshot {
    return {
        alive,
        facing: 'left',
        animation: { action: 'attack', startedAt: 100 },
    } as CharacterSnapshot
}

describe('authoritative hit presentation', () => {
    it('only reacts to visible, positive authoritative damage, never an attack or zero-damage dodge', () => {
        const timeline = new DamageTimeline()
        expect(
            timeline.receive({ kind: 'attack', targetId: 'hero', amount: 3 }, 10, true)
        ).toBeUndefined()
        expect(
            timeline.receive({ kind: 'damage', targetId: 'hero', amount: 0 }, 10, true)
        ).toBeUndefined()
        expect(
            timeline.receive({ kind: 'damage', targetId: 'hero', amount: -2 }, 10, true)
        ).toBeUndefined()
        expect(
            timeline.receive({ kind: 'damage', targetId: 'hero', amount: Number.NaN }, 10, true)
        ).toBeUndefined()
        expect(
            timeline.receive({ kind: 'damage', targetId: 'hero', amount: 3 }, 10, false)
        ).toBeUndefined()
        expect(timeline.receive({ kind: 'damage', amount: 3 }, 10, true)).toBeUndefined()
        expect(timeline.elapsed('hero', 10)).toBeUndefined()
        expect(
            timeline.receive({ kind: 'damage', targetId: 'hero', amount: 3 }, 10, true)
        ).toMatchObject({ targetId: 'hero', amount: 3, startedAt: 10 })
        expect(timeline.elapsed('hero', 10)).toBe(0)
        expect(timeline.elapsed('hero', 10 + hurtPoseMs - 1)).toBe(hurtPoseMs - 1)
        expect(timeline.elapsed('hero', 10 + hurtPoseMs)).toBeUndefined()
    })
    it('refreshes real consecutive hits and bounds actor history, with explicit location cleanup', () => {
        const timeline = new DamageTimeline()
        timeline.receive({ kind: 'damage', targetId: 'hero', amount: 3 }, 0, true)
        timeline.receive({ kind: 'damage', targetId: 'hero', amount: 2 }, 100, true)
        expect(timeline.elapsed('hero', 250)).toBe(150)
        for (let index = 0; index < maxDamageEffects; index++) {
            timeline.receive({ kind: 'damage', targetId: `npc${index}`, amount: 1 }, 100, true)
        }
        expect(timeline.elapsed('hero', 250)).toBeUndefined()
        timeline.clear()
        expect(timeline.elapsed('npc23', 250)).toBeUndefined()
    })
    it('keeps a verified human recoil pose visible over an attacking snapshot, then restores the attack', () => {
        const snapshot = fighter()
        const before = structuredClone(snapshot)
        expect(characterFrame(characterCatalog.player, snapshot, 200, 0)).toMatchObject({
            action: 'damaged',
            row: 9,
            frame: 0,
            flipHorizontal: true,
        })
        expect(characterFrame(characterCatalog.player, snapshot, 300, 200)).toMatchObject({
            action: 'damaged',
            row: 9,
            frame: 0,
        })
        expect(characterFrame(characterCatalog.player, snapshot, 300)).toMatchObject({
            action: 'attack',
            row: 7,
            frame: 2,
        })
        expect(snapshot).toEqual(before)
    })
    it('uses authored monster hurt frames while death always wins over a recent hit', () => {
        expect(characterFrame(characterCatalog.skeleton, fighter(), 300, 200)).toMatchObject({
            action: 'damaged',
            row: 10,
            frame: 1,
        })
        expect(characterFrame(characterCatalog.player, fighter(false), 200, 100)).toMatchObject({
            action: 'death',
            row: 9,
            frame: 0,
        })
    })
    it('holds the last real human death frame instead of advancing into transparent columns', () => {
        for (const id of [
            'player',
            'male_player_2',
            'male_mage',
            'female_player',
            'female_mage',
        ] as const) {
            expect(characterFrame(characterCatalog[id], fighter(false), 5000)).toMatchObject({
                action: 'death',
                row: 9,
                frame: 2,
            })
        }
    })

    it.each(['fat_zombie', 'skeleton'] as const)(
        'holds the fallen %s pose for as long as the server shows it dead',
        (id) => {
            const snapshot = {
                ...fighter(false),
                animation: { action: 'death', startedAt: 1000 } as const,
            }
            const frame = (now: number) => characterFrame(characterCatalog[id], snapshot, now)
            expect(frame(1000)).toMatchObject({ action: 'death', row: 12, frame: 0 })
            expect(frame(1540)).toMatchObject({ action: 'death', row: 12, frame: 3 })
            expect(frame(60_999)).toMatchObject({ action: 'death', row: 12, frame: 4 })
            const risen = {
                ...snapshot,
                alive: true,
                animation: { action: 'idle', startedAt: 61_000 } as const,
            }
            expect(characterFrame(characterCatalog[id], risen, 61_000)).toMatchObject({
                action: 'idle',
                row: 1,
                frame: 0,
            })
        }
    )
})
