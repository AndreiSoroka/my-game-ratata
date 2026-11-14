import type { CharacterArchetype } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { Mob1Controller } from '../src/game/controllers'
import type { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'

describe('mob controller behavior', () => {
    it('keeps skeleton attacking at low hp instead of fleeing', () => {
        const now = 5_000
        const skeleton = createCharacter('skeleton', 'Skeleton', 'skeleton', {
            x: 16,
            y: 16,
        })
        const player = createCharacter('player', 'Player', 'human', {
            x: 16,
            y: 24,
        })
        const requestAttack = vi.fn()
        skeleton.hp = 1

        new Mob1Controller(1, { fleeWhenThreatened: false }).update(
            skeleton,
            fakeControllerRoom(player, requestAttack),
            now
        )

        expect(skeleton.remainingPath()).toEqual([])
        expect(requestAttack).toHaveBeenCalledWith(skeleton, now)
    })

    it('makes slime flee at low hp when the target is not in melee range', () => {
        const now = 5_500
        const slime = createCharacter('slime', 'Slime', 'slime', {
            x: 16,
            y: 16,
        })
        const player = createCharacter('player', 'Player', 'human', {
            x: -32,
            y: 16,
        })
        const requestAttack = vi.fn()
        slime.hp = 1

        new Mob1Controller(1, { fleeWhenThreatened: true }).update(
            slime,
            fakeControllerRoom(player, requestAttack),
            now
        )

        expect(slime.remainingPath()[0]?.x).toBeGreaterThan(slime.position.x)
        expect(requestAttack).not.toHaveBeenCalled()
    })

    it('lets fleeing slime attack in melee and keep fleeing afterwards', () => {
        const now = 6_000
        const slime = createCharacter('slime', 'Slime', 'slime', {
            x: 16,
            y: 16,
        })
        const player = createCharacter('player', 'Player', 'human', {
            x: 8,
            y: 16,
        })
        const requestAttack = vi.fn()
        slime.hp = 1

        new Mob1Controller(1, { fleeWhenThreatened: true }).update(
            slime,
            fakeControllerRoom(player, requestAttack),
            now
        )

        expect(requestAttack).toHaveBeenCalledWith(slime, now)
        expect(slime.remainingPath()[0]?.x).toBeGreaterThan(slime.position.x)
    })
})

function createCharacter(
    id: string,
    nickname: string,
    archetype: CharacterArchetype,
    spawnPosition: { x: number; y: number }
): GameCharacter {
    return new GameCharacter({
        archetype,
        controllerKind: archetype === 'human' ? 'network_player' : 'mob1',
        id,
        nickname,
        spawnPosition,
    })
}

function fakeControllerRoom(
    target: GameCharacter,
    requestAttack: ReturnType<typeof vi.fn>
): GameRoom {
    return {
        charactersFor: () => [target],
        findVisibleTarget: () => target,
        navigationFor: () => fakeControllerNavigation,
        requestAttack,
    } as unknown as GameRoom
}

const fakeControllerNavigation = {
    grid: { tileWidth: 16 },
    findPathWorld(
        _from: { x: number; y: number },
        to: { x: number; y: number }
    ) {
        return [to]
    },
} as NavigationService
