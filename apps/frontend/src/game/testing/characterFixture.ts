import type { AdventureSnapshot, CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'

export function characterFixture(
    id: string,
    overrides: Partial<CharacterSnapshot> = {}
): CharacterSnapshot {
    return {
        id,
        nickname: id,
        alive: true,
        archetype: 'human',
        creatureType: 'humanoid',
        visualId: 'player',
        controllerKind: 'network_player',
        faction: 'peaceful',
        hp: 24,
        maxHp: 24,
        facing: 'down',
        tags: [],
        path: [],
        attackZones: [],
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        inventory: [],
        equipment: {},
        reputation: {},
        resources: { energy: 100, maxEnergy: 100, mana: 40, maxMana: 40 },
        stats: {
            moveSpeed: 110,
            minDamage: 1,
            maxDamage: 4,
            attackCooldownMs: 600,
            critChance: 0,
            dodgeChance: 0,
        },
        animation: { action: 'idle', startedAt: 0 },
        cooldowns: { attackMsLeft: 0, respawnMsLeft: 0, stunMsLeft: 0 },
        movement: { mode: 'sneaking', dashing: false, dashCooldownMsLeft: 0 },
        theft: {
            cooldownMsLeft: 0,
            wantedMsLeft: 0,
            blacklisted: false,
            lastResult: null,
            accusations: [],
        },
        ...overrides,
    }
}

export function worldFixture(characters: CharacterSnapshot[], serverTime = 100_000): WorldSnapshot {
    return { characters, serverTime, tick: 1, items: [], chests: [] }
}

export function adventureFixture(gold = 0): AdventureSnapshot {
    return {
        dialogue: null,
        gold,
        notice: null,
        farmPlots: [],
        resourceNodes: [],
        recipes: [],
        trophies: 0,
        wardRestored: false,
        materials: { grain: 0, herbs: 0, wood: 0, fiber: 0, scrap: 0 },
        quest: {
            id: 'quest',
            title: '',
            description: '',
            goal: 3,
            kills: 0,
            status: 'available',
            rewardGold: 40,
        },
        shop: [],
    }
}
