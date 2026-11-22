import { worldLocationNeighbor } from '../contracts/src/world.ts'
import { addInteriorBuilding } from './generate-interiors.mjs'
import { addTrainingGround } from './generate-training.mjs'
import {
    CITY_BUILDINGS,
    CITY_GENERATION_VERSION,
    intersects,
    planCity,
    rectangleCells,
} from './city-layout.mjs'
import {
    drawFortifications,
    planFortifications,
} from './city-fortifications.mjs'
import {
    addCityResources,
    cityAnchor,
    drawCemetery,
    drawChapelTower,
    stringProperty,
} from './city-details.mjs'
import { cityRoads } from './city-roads.mjs'

/** One authoritative authored map supplies rendering, navigation, anchors and interactions. */
export function addNovogorod(ctx, location) {
    const {
        width,
        height,
        at,
        grass,
        terrain,
        plants,
        structures,
        objects,
        solid,
        reserved,
        roads,
    } = ctx
    const fort = planFortifications(width, height)
    const plan = planCity(
        ctx.generationSeed ?? 20261106,
        ctx.cityStyle,
        fort.reserved,
        { forceFallback: ctx.forceCityFallback === true }
    )
    for (const layer of [terrain, plants, structures, objects, solid])
        layer.fill(0)
    grass.fill(37)
    roads.fill(false)
    reserved.fill(false)
    ctx.propPlacements.length = 0
    const covers = Array(width * height).fill(0),
        buildings = [],
        fronts = [],
        destinations = [],
        anchors = []
    let nextAnchor = 60000
    const nextId = () => nextAnchor++
    const reserve = (rectangle, padding = 0) => {
        for (
            let y = rectangle.y - padding;
            y < rectangle.y + rectangle.h + padding;
            y++
        )
            for (
                let x = rectangle.x - padding;
                x < rectangle.x + rectangle.w + padding;
                x++
            )
                if (x >= 0 && y >= 0 && x < width && y < height)
                    reserved[at(x, y)] = true
    }
    for (let index = 0; index < reserved.length; index++)
        reserved[index] = fort.reserved[index]
    for (const rectangle of plan.plots) reserve(rectangle, 2)
    reserve(plan.plaza)
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4)
                reserved[at(x, y)] = true
    const fortifications = drawFortifications(ctx, fort)
    const getPlot = (key) => plan.plots.find((plot) => plot.key === key)
    for (let index = 0; index < CITY_BUILDINGS.length; index++) {
        const definition = CITY_BUILDINGS[index],
            plot = getPlot(definition.key)
        const x = plot.x,
            y = plot.y + (definition.key === 'chapel' ? 4 : 0)
        const occupant = [
            x + Math.floor(definition.w / 2),
            y + Math.floor(definition.h / 2),
        ]
        const extra =
            definition.key === 'inn'
                ? [[x + 7, y + 4]]
                : definition.key === 'chapel'
                  ? [[x + 3, y + 3]]
                  : []
        const result = addInteriorBuilding(
            { ...ctx, covers },
            {
                ...definition,
                id: 100 + index,
                x,
                y,
                occupant,
                extraOccupants: extra,
            }
        )
        result.object.properties.push(
            stringProperty('semanticId', `novogorod.${definition.key}`)
        )
        buildings.push(result.object)
        fronts.push(result.front)
        destinations.push(
            ...result.destinations.filter(
                ([px, py]) =>
                    definition.key !== 'chapel' || px !== x + 3 || py !== y + 3
            )
        )
        anchors.push(
            cityAnchor(nextId(), `service.${definition.key}`, ...occupant)
        )
        if (definition.key === 'inn')
            anchors.push(
                cityAnchor(nextId(), 'service.inn.princess', ...extra[0])
            )
    }
    const chapel = getPlot('chapel')
    drawChapelTower(ctx, chapel)
    const cemetery = drawCemetery(ctx, chapel, nextId)
    anchors.push(...cemetery.anchors)
    const grave = anchors.find((anchor) => anchor.name === 'spawn.grave-1')
    anchors.push({
        ...grave,
        id: nextId(),
        name: 'player',
        properties: [stringProperty('anchorId', 'player')],
    })
    const bellTile = [chapel.x + 3, chapel.y + 7]
    anchors.push(cityAnchor(nextId(), 'bell', ...bellTile))
    solid[at(...bellTile)] = 1
    const { ground, route } = cityRoads(ctx, plan)
    const pen = getPlot('training'),
        ox = pen.x - 57,
        oy = pen.y - 43
    const training = addTrainingGround(
        { ...ctx, at: (x, y) => at(x + ox, y + oy) },
        location.id,
        (x, y) => ground(x + ox, y + oy)
    ).map((object) => ({
        ...object,
        x: object.x + ox * 16,
        y: object.y + oy * 16,
    }))
    anchors.push(cityAnchor(nextId(), 'training', pen.x + 10, pen.y + 6))
    fronts.push([pen.x - 1, pen.y + 6], cemetery.entrance)
    // Authored plaza props obey the same clearance as later decoration passes.
    const standingPoint = (x, y) =>
        !fort.reserved[at(x, y)] &&
        !solid[at(x, y)] &&
        Math.abs(x - 48) > 1 &&
        Math.abs(y - 40) > 1 &&
        !plan.plots.some((plot) => intersects({ x, y, w: 1, h: 1 }, plot, 2))
    const plazaProps = []
    for (const [x, y] of rectangleCells(plan.plaza)) {
        if (
            !standingPoint(x, y) ||
            plazaProps.some(([px, py]) => Math.hypot(x - px, y - py) < 2)
        )
            continue
        const tile = plazaProps.length === 0 ? 616 : 641
        objects[at(x, y)] = tile
        solid[at(x, y)] = 1
        plazaProps.push([x, y])
        if (plazaProps.length === 2) break
    }
    for (const point of fronts) route(point)
    for (const [x, y] of [
        ...fronts.slice(0, CITY_BUILDINGS.length),
        cemetery.entrance,
    ])
        for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) ground(x + dx, y + dy)
    for (const point of destinations) route(point, false)
    for (const anchor of cemetery.anchors.filter(
        (object) => object.type === 'city_anchor'
    ))
        route([Math.floor(anchor.x / 16), Math.floor(anchor.y / 16)], false)
    for (const point of [
        [48, 0],
        [48, height - 1],
        [0, 40],
        [width - 1, 40],
    ])
        route(point, false)
    addCityResources(ctx)
    const resourceTiles = []
    for (const [x, y] of rectangleCells(plan.plaza)) {
        if (
            !standingPoint(x, y) ||
            resourceTiles.some(([px, py]) => Math.hypot(x - px, y - py) < 2)
        )
            continue
        resourceTiles.push([x, y])
        if (resourceTiles.length === 3) break
    }
    for (const [index, key] of ['herbs', 'fiber', 'scrap'].entries())
        anchors.push(
            cityAnchor(nextId(), `resource.${key}`, ...resourceTiles[index])
        )
    const portalTiles = []
    for (const [x, y] of rectangleCells(plan.plaza)) {
        if (
            !standingPoint(x, y) ||
            resourceTiles.some(([px, py]) => Math.hypot(x - px, y - py) < 2) ||
            portalTiles.some(([px, py]) => Math.hypot(x - px, y - py) < 2)
        )
            continue
        portalTiles.push([x, y])
        ground(x, y)
        anchors.push(cityAnchor(nextId(), `portal.${portalTiles.length}`, x, y))
        if (portalTiles.length === 4) break
    }
    anchors.push({
        id: nextId(),
        name: 'Площадь Новогорода',
        type: 'city_area',
        x: plan.plaza.x * 16,
        y: plan.plaza.y * 16,
        width: 160,
        height: 160,
        rotation: 0,
        visible: false,
        properties: [stringProperty('anchorId', 'plaza')],
    })
    const landmarks = []
    function landmark(name, kind, x, y, direction, extra = []) {
        landmarks.push({
            id: landmarks.length + 1,
            name,
            type: 'landmark',
            point: true,
            x: x * 16 + 8,
            y: y * 16 + 8,
            width: 0,
            height: 0,
            rotation: 0,
            visible: true,
            properties: [
                stringProperty('kind', kind),
                ...extra,
                ...(direction
                    ? [
                          stringProperty('direction', direction),
                          stringProperty(
                              'destinationLocationId',
                              worldLocationNeighbor(location.id, direction)?.id
                          ),
                      ]
                    : []),
            ],
        })
    }
    for (const [index, definition] of CITY_BUILDINGS.entries()) {
        if (definition.kind === 'home') continue
        landmark(definition.name, definition.kind, ...fronts[index])
    }
    landmark(
        'Лекарский сад',
        'garden',
        ...fronts[
            CITY_BUILDINGS.findIndex((entry) => entry.key === 'herbalist')
        ]
    )
    landmark('Кладбище часовни', 'cemetery', ...cemetery.entrance)
    landmark('Торговые ряды', 'market', plan.plaza.x + 3, plan.plaza.y + 3)
    landmark('Площадь Новогорода', 'plaza', 48, 40)
    landmark(
        'Тренировочный загон',
        'training',
        pen.x - 1,
        pen.y + 6,
        undefined,
        [stringProperty('interactionId', `${location.id}:training:sign-1`)]
    )
    for (const [name, x, y, direction] of [
        ['Северные ворота', 48, 16, 'north'],
        ['Южные ворота', 48, 63, 'south'],
        ['Западные ворота', 16, 40, 'west'],
        ['Восточные ворота', 80, 40, 'east'],
    ])
        landmark(name, 'gate', x, y, direction)
    const signExclusion = fort.reserved.slice()
    for (const rectangle of plan.plots) {
        const padding = plan.plots.includes(rectangle) ? 2 : 0
        for (const [x, y] of rectangleCells({
            x: rectangle.x - padding,
            y: rectangle.y - padding,
            w: rectangle.w + 2 * padding,
            h: rectangle.h + 2 * padding,
        }))
            if (x >= 0 && y >= 0 && x < width && y < height)
                signExclusion[at(x, y)] = true
    }
    for (const [x, y] of resourceTiles) signExclusion[at(x, y)] = true
    ctx.signExclusion = signExclusion
    ctx.signSearchRadius = 24
    ctx.cityPlan = plan
    return {
        landmarks,
        buildings,
        covers,
        training,
        anchors,
        fortifications,
        interactions: [
            {
                id: 65000,
                name: 'Колокол памяти',
                type: 'bell',
                x: bellTile[0] * 16,
                y: bellTile[1] * 16,
                width: 16,
                height: 16,
                rotation: 0,
                visible: true,
                properties: [
                    stringProperty('interactionId', 'novogorod:memory-bell'),
                    stringProperty('action', 'activate'),
                    stringProperty(
                        'text',
                        'Колокол памяти в часовне Новогорода.'
                    ),
                ],
            },
        ],
        generationProperties: [
            stringProperty('cityStyle', plan.style),
            {
                name: 'generationVersion',
                type: 'int',
                value: CITY_GENERATION_VERSION,
            },
        ],
    }
}
