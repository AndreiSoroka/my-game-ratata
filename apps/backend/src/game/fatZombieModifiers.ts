import type { GameCharacter } from './character'
import { type FatZombieBonuses, fatZombieStars } from './fatZombieStars'

const neutralBonuses: Readonly<FatZombieBonuses> = {
    physicalResistance: 0,
    stunReduction: 0,
    idleHpRegen: 0,
    movingHpRegen: 0,
    energyCapacity: 0,
    energyDiscount: 0,
    idleEnergyRegen: 0,
    movingEnergyRegen: 0,
    reachTiles: 0,
    halfWidthTiles: 0,
    pushTiles: 0,
    moveSpeed: 0,
    windupReductionMs: 0,
    movementLockReductionMs: 0,
    cycleReductionMs: 0,
}
const starBonuses = fatZombieStars.map(({ id, bonuses }) => ({
    id,
    entries: Object.entries(bonuses) as Array<[keyof FatZombieBonuses, number]>,
}))

export function fatZombieBonuses(
    actor: Pick<GameCharacter, 'archetype' | 'progression'>
): Readonly<FatZombieBonuses> {
    if (actor.archetype !== 'fat_zombie') {
        return neutralBonuses
    }
    const bonuses = { ...neutralBonuses, pushTiles: 1.5 }
    const { opened, dormant } = actor.progression.constellations
    for (const { id, entries } of starBonuses) {
        if (!opened.has(id) || dormant.has(id)) {
            continue
        }
        for (const [key, value] of entries) {
            bonuses[key] += value
        }
    }
    return bonuses
}

export function effectiveOrdinaryAttackZones(
    actor: Pick<GameCharacter, 'archetype' | 'config' | 'progression'>
) {
    const { attackZones } = actor.config
    if (actor.archetype !== 'fat_zombie') {
        return attackZones
    }
    const { reachTiles, halfWidthTiles } = fatZombieBonuses(actor)
    return attackZones.map((zone) => ({
        ...zone,
        minX: zone.minX - halfWidthTiles,
        maxX: zone.maxX + halfWidthTiles,
        maxY: zone.maxY + reachTiles,
    }))
}
