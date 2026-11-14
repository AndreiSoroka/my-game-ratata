/** Atlas recognition happens during authoring; server rules consume only semantic sources. */
export function createEncounterMetadata(ctx, location, props) {
    const graves =
        location.dangerLevel === 0
            ? []
            : props
                  .filter((prop) =>
                      JSON.parse(
                          prop.properties.find(
                              (property) => property.name === 'tiles'
                          ).value
                      ).includes(204)
                  )
                  .map((prop, index) => ({
                      id: 30000 + index,
                      name: 'Старая могила',
                      type: 'grave_source',
                      x: prop.x + prop.width / 2,
                      y: prop.y + prop.height / 2,
                      width: 0,
                      height: 0,
                      point: true,
                      rotation: 0,
                      visible: true,
                      properties: [
                          {
                              name: 'sourceId',
                              type: 'string',
                              value: `${location.id}:grave:${prop.x / 16}:${prop.y / 16}`,
                          },
                          {
                              name: 'propId',
                              type: 'string',
                              value: prop.properties.find(
                                  (property) => property.name === 'propId'
                              ).value,
                          },
                      ],
                  }))
    const habitats =
        location.dangerLevel === 0
            ? []
            : shorelineCandidates(ctx).map((point, index) => ({
                  id: 31000 + index,
                  name: 'Берег для слизи',
                  type: 'slime_shore',
                  x: point.x * 16 + 8,
                  y: point.y * 16 + 8,
                  width: 0,
                  height: 0,
                  point: true,
                  rotation: 0,
                  visible: true,
                  properties: [
                      {
                          name: 'habitatId',
                          type: 'string',
                          value: `${location.id}:slime-shore:${point.x}:${point.y}`,
                      },
                      { name: 'waterX', type: 'int', value: point.water.x },
                      { name: 'waterY', type: 'int', value: point.water.y },
                  ],
              }))
    return [
        layer(17, 'Grave sources', graves),
        layer(18, 'Slime habitats', habitats),
    ]
}

function layer(id, name, objects) {
    return {
        id,
        name,
        type: 'objectgroup',
        visible: false,
        opacity: 1,
        draworder: 'topdown',
        objects,
    }
}

function shorelineCandidates(ctx) {
    const { width, height, at, solid, roads, reserved, terrain } = ctx
    const reached = reachableGround(ctx)
    const candidates = []
    const water = (x, y) => terrain[at(x, y)] >= 110 && terrain[at(x, y)] < 134
    for (let y = 9; y < height - 8; y++) {
        for (let x = 9; x < width - 8; x++) {
            const cell = at(x, y)
            if (
                solid[cell] ||
                roads[cell] ||
                reserved[cell] ||
                !reached.has(cell) ||
                Math.hypot(x - 42, y - 46) <= 8
            )
                continue
            const shore = [
                { x: x - 1, y },
                { x: x + 1, y },
                { x, y: y - 1 },
                { x, y: y + 1 },
            ].find((point) => water(point.x, point.y))
            if (shore) candidates.push({ x, y, water: shore })
        }
    }
    // Keep representative spaced positions around all natural water, including large undrinkable lakes.
    const selected = []
    for (const candidate of candidates) {
        if (
            selected.every(
                (point) =>
                    Math.hypot(point.x - candidate.x, point.y - candidate.y) >=
                    3
            )
        )
            selected.push(candidate)
    }
    return selected
}

function reachableGround({ width, height, solid, at }) {
    const reached = new Set([at(48, 40)])
    for (const cell of reached) {
        const x = cell % width,
            y = Math.floor(cell / width)
        for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
        ]) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const next = at(nx, ny)
            if (!solid[next]) reached.add(next)
        }
    }
    return reached
}
