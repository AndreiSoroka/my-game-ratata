import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { movementNoise } from '../src/game/movementNoise'
import { NavigationService } from '../src/game/navigation'
import { visibilityRadius } from '../src/game/queries'
import { practiceThreshold, trainSkill } from '../src/game/skillProgression'
import { practiceStealthMovement } from '../src/game/stealthPractice'

function fixture(kind: GameCharacter['controllerKind'] = 'network_player') {
    const actor = new GameCharacter({
        id: 'sneak',
        nickname: 'Тень',
        archetype: 'human',
        controllerKind: kind,
        faction: 'peaceful',
        spawnPosition: { x: 136, y: 120 },
    })
    actor.movement.mode = 'sneaking'
    const observer = new GameCharacter({
        id: 'watcher',
        nickname: 'Дозорный',
        archetype: 'skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x: 168, y: 200 },
    })
    observer.facing = 'down'
    const navigation = new NavigationService({
        id: 'test',
        width: 30,
        height: 30,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(900).fill(false),
        solidLayerNames: [],
    })
    function move(x: number, now: number, y = 120) {
        const before = { ...actor.position }
        actor.position = { x, y }
        return practiceStealthMovement(
            actor,
            before,
            [actor, observer],
            navigation,
            now
        )
    }
    function pass(start = 1000) {
        for (let i = 1; i <= 4; i += 1) {
            move(136 + i * 16, start + i * 400)
        }
    }
    return { actor, observer, navigation, move, pass }
}

describe('stealth practice through meaningful movement', () => {
    it.each(['network_player', 'scripted'] as const)(
        'awards the same unseen pass for %s',
        (kind) => {
            const { actor, pass } = fixture(kind)
            pass()
            expect(actor.progression.skills.stealth.practice).toBe(1)
            expect(
                actor.snapshot(3000).progression?.practicedBranches
            ).toContain('cunning')
        }
    )

    it('does not reward standing, teleporting, wall shuffling or rapidly reusing the same ground', () => {
        const { actor, pass, move } = fixture()
        move(136, 1000)
        move(200, 1100)
        expect(actor.progression.skills.stealth.practice).toBe(0)
        actor.position.x = 136
        pass()
        for (let now = 3000; now < 10_000; now += 1000) {
            move(184, now)
            move(168, now + 100)
            move(152, now + 200)
            move(168, now + 300)
            move(184, now + 400)
            move(200, now + 500)
        }
        expect(actor.progression.skills.stealth.practice).toBe(1)
        actor.position.x = 136
        pass(65_000)
        expect(actor.progression.skills.stealth.practice).toBe(2)
    })

    it.each([
        'walking',
        'dead',
        'offline',
        'stunned',
        'attack',
        'no-observer',
        'seen',
        'wall',
        'other-map',
        'own-follower',
    ])('grants no practice when %s', (reason) => {
        const { actor, observer, navigation, pass } = fixture()
        if (reason === 'walking') {
            actor.movement.mode = 'walking'
        }
        if (reason === 'dead') {
            actor.alive = false
        }
        if (reason === 'offline') {
            actor.tags.add('offline')
        }
        if (reason === 'stunned') {
            actor.stunUntil = 10_000
        }
        if (reason === 'attack') {
            actor.lastAttackAt = 5000
        }
        if (reason === 'no-observer') {
            observer.position.x = 400
        }
        if (reason === 'seen') {
            observer.position.y = 130
        }
        if (reason === 'other-map') {
            observer.locationId = 'map-0-0'
        }
        if (reason === 'own-follower') {
            observer.soul.companion = {
                leaderId: actor.id,
                order: 'follow',
                canFight: false,
                lastReply: '',
            }
        }
        if (reason === 'wall') {
            for (let x = 0; x < 30; x += 1) {
                navigation.grid.solid[10 * 30 + x] = true
            }
        }
        pass()
        expect(actor.progression.skills.stealth.practice).toBe(0)
    })

    it('earns levels with increasing costs, improves perception/noise and loses both skills on permadeath', () => {
        const { actor, observer, navigation } = fixture()
        actor.position = { x: 168, y: 152 }
        const radius = visibilityRadius(observer, actor, 112, 1000)
        const firstNoise = movementNoise(actor, navigation, 16, false, 1000)
        const base = practiceThreshold(actor.progression, 'stealth')
        trainSkill(actor, 'stealth', base)
        expect(actor.progression.skills.stealth.level).toBe(2)
        expect(practiceThreshold(actor.progression, 'stealth')).toBeGreaterThan(
            base
        )
        expect(visibilityRadius(observer, actor, 112, 2000)).toBeLessThan(
            radius
        )
        const trainedNoise = movementNoise(actor, navigation, 16, false, 2000)
        expect(trainedNoise?.radius).toBeLessThan(firstNoise?.radius ?? 0)
        trainSkill(actor, 'theft', 100)
        actor.applyDamage(actor.hp, 3000)
        retireCharacter(actor)
        expect(actor.progression.skills.stealth).toEqual({
            level: 1,
            practice: 0,
            unlocked: true,
        })
        expect(actor.progression.skills.theft).toEqual({
            level: 1,
            practice: 0,
            unlocked: true,
        })
    })
})

describe('human observers', () => {
    it('does not train safely beside a friendly human-controlled NPC', () => {
        const { actor, observer, pass } = fixture()
        actor.reputation.monsters = 1
        observer.soul.canSpeak = true
        observer.soul.controlSource = 'human'
        pass()
        expect(actor.progression.skills.stealth.practice).toBe(0)
    })
})
