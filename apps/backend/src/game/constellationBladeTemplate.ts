import type { SkyPoint } from './constellationGeometry'

/** Six separated primary families; additional mandatory AND links route between their branches. */
export const bladeLocalTemplatePositions: Record<string, SkyPoint> =
    Object.fromEntries(
        Object.entries({
            root: [0, 0],
            tempo: [670, 230],
            tempo2: [1140, 420],
            critical: [1100, 100],
            critical2: [1630, 0],
            lunge: [460, 800],
            long_lunge: [470, 1310],
            lunge_recovery: [490, 1720],
            ideal_position: [890, 680],
            fluid_stance: [1090, 1220],
            combo1: [1480, 790],
            combo2: [1700, 1230],
            combo3: [2040, 1600],
            dodge: [-90, 690],
            dodge2: [-50, 1200],
            defensive_stance: [-670, 520],
            guard_strong: [-1200, 750],
            arrow_deflect: [-1560, 1210],
            long_frontier: [-1680, 490],
            counterattack: [-530, 1040],
            resolve: [-810, -30],
            resolve2: [-1280, -210],
            steel_sinew: [-1760, -380],
            insight1: [-420, -290],
            insight2: [-840, -580],
            insight3: [-1260, -870],
            damage1: [-300, -720],
            damage2: [-600, -1440],
            stun1: [-110, -1520],
            stun2: [-50, -2060],
            stun3: [-170, -2690],
            pommel_strike: [390, -1830],
            pommel_stun: [620, -2270],
            pommel_break: [680, -2810],
            economy: [530, -570],
            economy2: [970, -320],
            wide_swing: [1010, -830],
            wide_arc: [1380, -1080],
            wide_flow: [1750, -1330],
            circular_swing: [1320, -1570],
            circle_ring: [1470, -2000],
            circle_axis: [1610, -2420],
        }).map(([id, [x = 0, y = 0]]) => [
            `blade.${id}`,
            { x: x * 1.3, y: y * 1.3 },
        ])
    )

export const bladeTemplatePositions = bladeLocalTemplatePositions
