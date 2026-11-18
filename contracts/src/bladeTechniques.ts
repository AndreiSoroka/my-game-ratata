import type { BladeAbilityId } from './abilities'

export interface BladeTechniqueBonuses {
    bladeWideArc: boolean
    bladeWideFlow: boolean
    bladeCircleRing: boolean
    bladeCircleAxis: boolean
    bladeLongLunge: boolean
    bladeLungeRecovery: boolean
    bladePommelStun: boolean
    bladePommelBreak: boolean
}
export interface BladeTechniqueParameters {
    cycleMs: number
    windupMs: number
    movementMs: number
    damageMultiplier: number
    mana: number
    energy: number
    cooldownMs: number
    range: number
    radius: number
    angleDegrees?: number
    lungeDistance?: number
    stunMs?: number
    targetEnergyDrain: number
    movementFraction?: number
}
interface TechniqueInput {
    bonuses: BladeTechniqueBonuses
    energy: number
    radius: number
}
const shared = { mana: 0, targetEnergyDrain: 8 }
const techniqueResolvers: Record<
    BladeAbilityId,
    (input: TechniqueInput) => BladeTechniqueParameters
> = {
    wide_swing: wideSwing,
    circular_swing: circularSwing,
    lunge,
    pommel_strike: pommelStrike,
    defensive_stance: defensiveStance,
}

/** Server, atlas and UI consume one table; E is the already resolved ordinary strike price. */
export function resolveBladeTechnique(
    id: BladeAbilityId,
    bonuses: BladeTechniqueBonuses,
    ordinaryEnergy: number,
    ordinaryRadius: number
): BladeTechniqueParameters {
    return techniqueResolvers[id]({
        bonuses,
        energy: ordinaryEnergy,
        radius: ordinaryRadius,
    })
}

function wideSwing({
    bonuses,
    energy,
    radius,
}: TechniqueInput): BladeTechniqueParameters {
    return {
        ...shared,
        cycleMs: 650,
        windupMs: 250,
        movementMs: bonuses.bladeWideFlow ? 350 : 450,
        damageMultiplier: 0.75,
        energy: Math.ceil(energy * 1.5),
        cooldownMs: 4000,
        range: radius * 1.1,
        radius: radius * 1.1,
        angleDegrees: bonuses.bladeWideArc ? 150 : 120,
    }
}
function circularSwing({
    bonuses,
    energy,
    radius,
}: TechniqueInput): BladeTechniqueParameters {
    const reach = radius * (bonuses.bladeCircleRing ? 1.5 : 1.25)
    return {
        ...shared,
        cycleMs: 900,
        windupMs: 500,
        movementMs: 800,
        damageMultiplier: 0.6,
        energy: Math.ceil(energy * 2.5),
        cooldownMs: 8000,
        range: reach,
        radius: reach,
        ...(bonuses.bladeCircleAxis ? { movementFraction: 0.25 } : {}),
    }
}
function lunge({
    bonuses,
    energy,
    radius,
}: TechniqueInput): BladeTechniqueParameters {
    const lungeDistance = radius * (bonuses.bladeLongLunge ? 1.5 : 1)
    return {
        ...shared,
        cycleMs: 600,
        windupMs: 250,
        movementMs: bonuses.bladeLungeRecovery ? 300 : 400,
        damageMultiplier: 1,
        energy: Math.ceil(energy * 1.25),
        cooldownMs: 5000,
        range: lungeDistance + radius,
        radius,
        lungeDistance,
    }
}
function pommelStrike({
    bonuses,
    energy,
    radius,
}: TechniqueInput): BladeTechniqueParameters {
    return {
        ...shared,
        cycleMs: 550,
        windupMs: 200,
        movementMs: 400,
        damageMultiplier: 0.25,
        energy: Math.ceil(energy * 1.5),
        cooldownMs: 6000,
        range: radius,
        radius,
        stunMs: bonuses.bladePommelStun ? 600 : 400,
        targetEnergyDrain: bonuses.bladePommelBreak ? 20 : 8,
    }
}
function defensiveStance(): BladeTechniqueParameters {
    return {
        ...shared,
        cycleMs: 0,
        windupMs: 0,
        movementMs: 0,
        damageMultiplier: 0,
        energy: 0,
        cooldownMs: 1000,
        range: 0,
        radius: 0,
    }
}

export function resolveBladeDefense(bonuses: {
    bladeGuardRank: number
    bladeArrowParry: boolean
    bladeLongFrontier: boolean
}) {
    const strong = bonuses.bladeGuardRank >= 2
    return {
        meleeReduction: strong ? 0.7 : 0.5,
        rangedReduction: strong ? 0.35 : 0.25,
        meleeParryChance: strong ? 0.4 : 0.3,
        rangedParryChance: bonuses.bladeArrowParry ? 0.1 : 0,
        parryEnergy: 5,
        hitEnergy: bonuses.bladeLongFrontier ? 5 : 7,
        reentryMs: 1000,
    }
}
