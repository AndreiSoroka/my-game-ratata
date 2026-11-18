/** Placement is data-only; rendering cannot make an invalid footprint fit. */
export const CITY_STYLES = ['grid', 'organic', 'ring']
export const CITY_GENERATION_VERSION = 9
export const CITY_BUILDINGS = [
    {
        key: 'guild',
        name: 'Гильдия искателей',
        kind: 'guild',
        w: 11,
        h: 10,
        stone: true,
    },
    {
        key: 'chapel',
        name: 'Часовня памяти',
        kind: 'chapel',
        w: 8,
        h: 11,
        red: true,
        stone: true,
    },
    {
        key: 'library',
        name: 'Городская библиотека',
        kind: 'library',
        w: 10,
        h: 9,
        stone: true,
    },
    {
        key: 'inn',
        name: 'Таверна «Три дороги»',
        kind: 'inn',
        w: 11,
        h: 9,
        red: true,
    },
    { key: 'workshop', name: 'Мастерские', kind: 'workshop', w: 8, h: 8 },
    { key: 'smithy', name: 'Кузница', kind: 'smithy', w: 9, h: 9, stone: true },
    { key: 'shop', name: 'Лавка Саввы', kind: 'shop', w: 10, h: 8 },
    {
        key: 'herbalist',
        name: 'Дом травницы',
        kind: 'home',
        w: 8,
        h: 8,
        red: true,
    },
    { key: 'baker', name: 'Дом пекаря', kind: 'home', w: 8, h: 8, red: true },
    { key: 'cartographer', name: 'Дом картографа', kind: 'home', w: 9, h: 8 },
    { key: 'weaver', name: 'Дом ткача', kind: 'home', w: 9, h: 8 },
]
const templates = {
    chapel: [16, 16, 20, 15],
    training: [65, 16, 15, 14],
    guild: [51, 16, 11, 10],
    library: [67, 44, 10, 9],
    inn: [16, 44, 11, 9],
    workshop: [29, 44, 8, 8],
    smithy: [55, 44, 9, 9],
    shop: [16, 55, 10, 8],
    herbalist: [28, 55, 8, 8],
    baker: [38, 16, 8, 8],
    cartographer: [51, 55, 9, 8],
    weaver: [62, 55, 9, 8],
}

export function cityRandom(seed) {
    let state = 2166136261
    for (const c of String(seed))
        state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 4294967296
    }
}
export function intersects(a, b, padding = 0) {
    return (
        a.x - padding < b.x + b.w &&
        a.x + a.w + padding > b.x &&
        a.y - padding < b.y + b.h &&
        a.y + a.h + padding > b.y
    )
}
export function rectangleCells(rectangle) {
    const cells = []
    for (let y = rectangle.y; y < rectangle.y + rectangle.h; y++)
        for (let x = rectangle.x; x < rectangle.x + rectangle.w; x++)
            cells.push([x, y])
    return cells
}
function mirrored(rectangle, flipX, flipY) {
    return {
        ...rectangle,
        x: flipX ? 97 - rectangle.x - rectangle.w : rectangle.x,
        y: flipY ? 81 - rectangle.y - rectangle.h : rectangle.y,
    }
}
function roadRectangles(plaza, style) {
    const result = [
        { x: 0, y: 39, w: 96, h: 3 },
        { x: 47, y: 0, w: 3, h: 80 },
    ]
    if (style === 'ring')
        result.push(
            { x: plaza.x - 3, y: plaza.y - 3, w: plaza.w + 6, h: 3 },
            { x: plaza.x - 3, y: plaza.y + plaza.h, w: plaza.w + 6, h: 3 },
            { x: plaza.x - 3, y: plaza.y, w: 3, h: plaza.h },
            { x: plaza.x + plaza.w, y: plaza.y, w: 3, h: plaza.h }
        )
    return result
}
function permitted(rectangle, occupied, plaza, roads, fortificationReserved) {
    return (
        rectangle.x >= 16 &&
        rectangle.y >= 16 &&
        rectangle.x + rectangle.w <= 81 &&
        rectangle.y + rectangle.h <= 65 &&
        !intersects(rectangle, plaza) &&
        !occupied.some((other) => intersects(rectangle, other, 2)) &&
        !roads.some((road) => intersects(rectangle, road)) &&
        rectangleCells(rectangle).every(
            ([x, y]) => !fortificationReserved[y * 96 + x]
        )
    )
}

/** 32 layout attempts, each at most 128 candidates per authored plot. */
export function planCity(
    seed,
    requestedStyle,
    fortificationReserved,
    options = {}
) {
    const random = cityRandom(`${seed}:city-layout:v${CITY_GENERATION_VERSION}`)
    const styleRoll = random()
    const style =
        requestedStyle ??
        CITY_STYLES[Math.floor(styleRoll * CITY_STYLES.length)]
    if (!CITY_STYLES.includes(style))
        throw new Error(`Unknown city layout style: ${style}`)
    const flipX = random() < 0.5,
        flipY = random() < 0.5
    const plaza = mirrored({ x: 42, y: 35, w: 10, h: 10 }, flipX, flipY)
    const roads = roadRectangles(plaza, style)
    const preferred = Object.entries(templates).map(([key, [x, y, w, h]]) => ({
        key,
        ...mirrored({ x, y, w, h }, flipX, flipY),
    }))
    const order = [...preferred].sort((a, b) =>
        a.key === 'chapel'
            ? -1
            : b.key === 'chapel'
              ? 1
              : a.key === 'training'
                ? -1
                : b.key === 'training'
                  ? 1
                  : b.w * b.h - a.w * a.h
    )
    for (
        let attempt = 0;
        attempt < (options.forceFallback ? 0 : 32);
        attempt++
    ) {
        const plots = []
        for (const base of order) {
            let selected
            for (let candidate = 0; candidate < 128; candidate++) {
                const radius =
                    style === 'organic' ? 4 : style === 'ring' ? 2 : 1
                const jitter = () =>
                    Math.floor(random() * (radius * 2 + 1)) - radius
                const test = {
                    ...base,
                    x: base.x + jitter(),
                    y: base.y + jitter(),
                }
                if (
                    !permitted(test, plots, plaza, roads, fortificationReserved)
                )
                    continue
                selected = test
                break
            }
            if (!selected) break
            plots.push(selected)
        }
        if (plots.length === preferred.length)
            return {
                style,
                plaza,
                roads,
                plots,
                fallback: false,
                attempts: attempt + 1,
            }
    }
    const plots = []
    for (const rectangle of order) {
        if (!permitted(rectangle, plots, plaza, roads, fortificationReserved))
            throw new Error(
                `Invalid checked ${style} city template: ${rectangle.key}`
            )
        plots.push(rectangle)
    }
    return { style, plaza, roads, plots, fallback: true, attempts: 32 }
}
