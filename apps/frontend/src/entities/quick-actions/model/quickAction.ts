import type { AbilityId } from '@my-game-ratata/contracts'

export interface QuickAction {
    label: string
    description?: string | undefined
    icon: { kind: 'glyph'; text: string } | { kind: 'image'; src: string }
    quantity?: number | undefined
    cooldownMs?: number | undefined
    active?: boolean | undefined
    repeat?: string | undefined
    disabled?: boolean | undefined
    unavailable?: boolean | undefined
}

export const hotbarGlyphs: Record<AbilityId, string> = {
    wide_swing: '◔',
    circular_swing: '◌',
    lunge: '➜',
    pommel_strike: '⚒',
    defensive_stance: '⛨',
    pray: '✦',
    pray_woven: '✥',
    pray_road: '➤',
    pray_lantern: '✧',
    pray_grave: '☾',
    spark: 'ϟ',
    barrier: '◇',
    shot: '➶',
    sniper_shot: '⊙',
    skeleton_strike: '⚒',
    fireball: '●',
    greater_fireball: '◉',
    chains: '∞',
    blink: '↶',
    dispel_magic: '✴',
    city_portal: '◈',
}
