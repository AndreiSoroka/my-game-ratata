import type {
    BladeComboSnapshot,
    CharacterSnapshot,
    PrayerAuraEffectId,
} from '@my-game-ratata/contracts'

export type PlayerEffectKind =
    | PrayerAuraEffectId
    | 'stun'
    | 'barrier'
    | 'defensive-stance'
    | 'blade-combo'
    | 'sneaking'
    | 'dashing'
    | 'theft-cooldown'
    | 'wanted'
    | 'blacklisted'

export interface PlayerEffect {
    kind: PlayerEffectKind
    remainingMs?: number
    stacks?: number
    stackLimit?: number
}

export interface PlayerEffectsData {
    effects: readonly PlayerEffect[]
    compact?: boolean
}

export function projectPlayerEffects(
    character: CharacterSnapshot,
    serverTime?: number
): PlayerEffect[] {
    const effects = character.alive ? livingEffects(character, serverTime) : []
    const theft = character.theft
    appendTimed(effects, 'theft-cooldown', theft?.cooldownMsLeft)
    appendTimed(effects, 'wanted', theft?.wantedMsLeft)
    if (theft?.blacklisted) effects.push({ kind: 'blacklisted' })
    return effects
}

function livingEffects(
    character: CharacterSnapshot,
    serverTime: number | undefined
): PlayerEffect[] {
    const { abilities, combat, cooldowns, movement, prayerAuraEffects } = character
    const effects: PlayerEffect[] = []
    appendTimed(effects, 'stun', cooldowns.stunMsLeft)
    appendTimed(effects, 'barrier', remainingUntil(abilities?.barrier?.expiresAt, serverTime))
    if (combat?.defensiveStance) effects.push({ kind: 'defensive-stance' })

    appendBladeCombo(effects, combat?.combo, serverTime)
    if (movement?.mode === 'sneaking') effects.push({ kind: 'sneaking' })
    if (movement?.dashing) effects.push({ kind: 'dashing' })
    for (const kind of prayerAuraEffects ?? []) effects.push({ kind })
    return effects
}

function appendBladeCombo(
    effects: PlayerEffect[],
    combo: BladeComboSnapshot | undefined,
    serverTime: number | undefined
): void {
    if (combo === undefined) return
    const remainingMs = remainingUntil(combo.expiresAt, serverTime)
    if (remainingMs <= 0) return
    effects.push({
        kind: 'blade-combo',
        remainingMs,
        stacks: combo.stacks,
        stackLimit: combo.limit,
    })
}

function appendTimed(
    effects: PlayerEffect[],
    kind: PlayerEffectKind,
    remainingMs: number | undefined
): void {
    if (remainingMs !== undefined && remainingMs > 0) effects.push({ kind, remainingMs })
}

function remainingUntil(expiresAt: number | undefined, serverTime: number | undefined): number {
    return expiresAt === undefined || serverTime === undefined ? 0 : expiresAt - serverTime
}
