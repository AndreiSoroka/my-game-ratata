import type {
    ConstellationId,
    ConstellationLayoutSnapshot,
} from '@my-game-ratata/contracts'

export const constellationLayout: ConstellationLayoutSnapshot = {
    bounds: { x: -160, y: -160, width: 5020, height: 5020 },
    minimumNodeSpacing: 80,
    regions: {
        blade: { x: 0, y: 0, width: 1100, height: 1100 },
        magic: { x: 1800, y: 0, width: 1100, height: 1100 },
        prayer: { x: 3600, y: 0, width: 1100, height: 1100 },
        arrow: { x: 0, y: 1800, width: 1100, height: 1100 },
        life: { x: 1800, y: 1800, width: 1100, height: 1100 },
        shadow: { x: 3600, y: 1800, width: 1100, height: 1100 },
        prayer_road: { x: 0, y: 3600, width: 1100, height: 1100 },
        prayer_lantern: { x: 1800, y: 3600, width: 1100, height: 1100 },
        prayer_grave: { x: 3600, y: 3600, width: 1100, height: 1100 },
    },
}

interface Point {
    x: number
    y: number
}

/** Authored branch lanes; adding a star requires assigning its position explicitly. */
const localPositions: Record<string, Point> = {
    'blade.damage1': { x: 350, y: 150 },
    'blade.damage2': { x: 560, y: 150 },
    'blade.economy': { x: 350, y: 270 },
    'blade.tempo': { x: 350, y: 390 },
    'blade.critical': { x: 350, y: 510 },
    'blade.dodge': { x: 350, y: 630 },
    'blade.resolve': { x: 350, y: 750 },
    'blade.insight1': { x: 350, y: 870 },
    'blade.insight2': { x: 560, y: 870 },
    'magic.spark_damage': { x: 350, y: 150 },
    'magic.spark_range': { x: 350, y: 270 },
    'magic.spark_economy': { x: 350, y: 390 },
    'magic.barrier_strength': { x: 350, y: 510 },
    'magic.barrier_duration': { x: 560, y: 510 },
    'magic.fire_damage': { x: 350, y: 630 },
    'magic.mana1': { x: 350, y: 750 },
    'magic.mana2': { x: 560, y: 750 },
    'magic.mana3': { x: 770, y: 750 },
    'magic.insight': { x: 350, y: 870 },
    'magic.fireball': { x: 560, y: 990 },
    'magic.greater_fireball': { x: 770, y: 990 },
    'prayer.radius1': { x: 350, y: 100 },
    'prayer.radius2': { x: 560, y: 100 },
    'prayer.focus': { x: 350, y: 280 },
    'prayer.gift1': { x: 350, y: 460 },
    'prayer.gift2': { x: 560, y: 460 },
    'prayer.harm': { x: 350, y: 640 },
    'prayer.harm1': { x: 560, y: 640 },
    'prayer.harm2': { x: 770, y: 640 },
    'prayer.area': { x: 770, y: 280 },
    'prayer.omen1': { x: 350, y: 820 },
    'prayer.omen2': { x: 560, y: 820 },
    'prayer.omen3': { x: 770, y: 820 },
    'prayer.omen4': { x: 980, y: 820 },
    'prayer.others1': { x: 350, y: 1000 },
    'prayer.others2': { x: 560, y: 1000 },
    'prayer.others3': { x: 770, y: 1000 },
    'prayer.others4': { x: 980, y: 1000 },
    'prayer.revive': { x: 980, y: 460 },
    'arrow.damage1': { x: 350, y: 150 },
    'arrow.damage2': { x: 560, y: 150 },
    'arrow.range1': { x: 350, y: 300 },
    'arrow.range2': { x: 560, y: 300 },
    'arrow.economy': { x: 350, y: 450 },
    'arrow.tempo': { x: 350, y: 600 },
    'arrow.critical': { x: 350, y: 750 },
    'arrow.insight1': { x: 350, y: 900 },
    'arrow.insight2': { x: 560, y: 900 },
    'life.hp1': { x: 350, y: 150 },
    'life.hp2': { x: 560, y: 150 },
    'life.hp3': { x: 770, y: 150 },
    'life.hp4': { x: 980, y: 150 },
    'life.energy1': { x: 350, y: 390 },
    'life.energy2': { x: 560, y: 390 },
    'life.energy3': { x: 770, y: 390 },
    'life.move': { x: 350, y: 630 },
    'life.dash': { x: 350, y: 870 },
    'shadow.speed': { x: 350, y: 150 },
    'shadow.noise1': { x: 350, y: 300 },
    'shadow.noise2': { x: 560, y: 300 },
    'shadow.sight': { x: 350, y: 450 },
    'shadow.economy': { x: 350, y: 600 },
    'shadow.luck1': { x: 350, y: 750 },
    'shadow.luck2': { x: 560, y: 750 },
    'shadow.tempo': { x: 350, y: 900 },
    'prayer_grave.revive': { x: 350, y: 550 },
}

const jointPositions: Record<string, Point> = {
    'prayer.last_light': { x: 3250, y: 1450 },
    'magic.runic_echo': { x: 1450, y: 1450 },
}

const edgeWaypoints: Record<string, Point[]> = {
    'magic.root>magic.fireball': [{ x: 1900, y: 990 }],
    'prayer.root>prayer.revive': [{ x: 4580, y: 550 }],
    'prayer.gift1>prayer.last_light': [{ x: 3250, y: 460 }],
    'life.hp1>prayer.last_light': [{ x: 2150, y: 1450 }],
    'magic.spark_damage>magic.runic_echo': [{ x: 1450, y: 150 }],
    'arrow.damage1>magic.runic_echo': [{ x: 350, y: 1450 }],
}

export function constellationPosition(
    id: string,
    path: ConstellationId
): Point {
    const joint = jointPositions[id]
    if (joint !== undefined) {
        return { ...joint }
    }
    const local = id.endsWith('.root') ? { x: 100, y: 550 } : localPositions[id]
    if (local === undefined) {
        throw new Error(`Constellation star has no authored position: ${id}`)
    }
    const region = constellationLayout.regions[path]
    return { x: region.x + local.x, y: region.y + local.y }
}

export function constellationEdgeWaypoints(
    from: string,
    to: string
): Point[] | undefined {
    return edgeWaypoints[`${from}>${to}`]?.map((point) => ({ ...point }))
}
