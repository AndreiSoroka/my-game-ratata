import type { LocalizedMessage } from './locales'
import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    WORLD_LOCATION_DEFINITIONS,
    WORLD_LOCATION_ENGLISH_NAMES,
    type WorldDirection,
    type WorldLocationDefinition,
    worldLocationNeighbor,
} from './world.ts'

type Pair = readonly [russian: string, english: string]
interface Content {
    name: Pair
    text: Pair
}

const landmarks = {
    shop: {
        name: ['Лавка Саввы', 'Savva’s Shop'],
        text: [
            'Савва продаёт еду, мечи и сапоги.',
            'Savva sells food, swords, and boots.',
        ],
    },
    guild: {
        name: ['Гильдия искателей', 'Seekers’ Guild'],
        text: [
            'Мира принимает обращения жителей и предлагает искателям доступные городские поручения.',
            'Mira hears requests from residents and offers available city jobs to seekers.',
        ],
    },
    chapel: {
        name: ['Часовня памяти', 'Chapel of Memory'],
        text: [
            'Сестра Вера обучает молитвам Угольной Матери и Безымянного Путника, помогает раненым и отпускает городские грехи.',
            'Sister Vera teaches prayers to the Coal Mother and the Nameless Wanderer, tends the wounded, and grants absolution from city offenses.',
        ],
    },
    library: {
        name: ['Городская библиотека', 'City Library'],
        text: [
            'Арен обучает огненному шару. Здесь можно прочесть три главы о магии.',
            'Aren teaches Firebolt. Three chapters on magic are available here.',
        ],
    },
    tavern: {
        name: ['Таверна «Три дороги»', 'Three Roads Tavern'],
        text: [
            'Здесь останавливаются Бран и Лея. Познакомьтесь, прежде чем звать их в путь.',
            'Bran and Leia stay here. Introduce yourself before asking them to travel with you.',
        ],
    },
    workshops: {
        name: ['Мастерские', 'Workshops'],
        text: [
            'Мастерица Мила работает у станка. Волокно для ремесла найдётся у площади.',
            'Mila works at the loom. Look for crafting fiber near the square.',
        ],
    },
    forge: {
        name: ['Кузница', 'Forge'],
        text: [
            'Здесь работает кузнец Игнат. Металл для ремесла ищите у площади.',
            'Ignat the smith works here. Look for crafting metal near the square.',
        ],
    },
    market: {
        name: ['Торговые ряды', 'Market Stalls'],
        text: [
            'Здесь встречаются горожане и обсуждают городские припасы.',
            'Residents meet here to discuss the city’s supplies.',
        ],
    },
    garden: {
        name: ['Лекарский сад', 'Medicinal Garden'],
        text: [
            'У дома травницы помогают разбираться в целебных травах.',
            'Ask at the herbalist’s house for help identifying medicinal herbs.',
        ],
    },
    cemetery: {
        name: ['Кладбище часовни', 'Chapel Cemetery'],
        text: [
            'Здесь покоятся оставленные тела. Иногда Искра пробуждает одного из них к новой жизни.',
            'Abandoned bodies rest here. Sometimes a Spark wakes one into a new life.',
        ],
    },
    square: {
        name: ['Площадь Новогорода', 'Novogorod Square'],
        text: [
            'Стражница Рада принимает жалобы на замеченных воров.',
            'Rada of the city watch takes reports of witnessed thefts.',
        ],
    },
    training: {
        name: ['Тренировочный загон', 'Training Yard'],
        text: [
            'Внутри ограды видны области атак и точный урон по манекену.',
            'Inside the fence, you can see attack areas and exact damage dealt to the dummy.',
        ],
    },
    farm: {
        name: ['Пшеничная ферма', 'Wheat Farm'],
        text: [
            'Созревшую пшеницу можно собрать. Засейте пустую грядку для следующего урожая.',
            'Harvest ripe wheat. Sow an empty plot for the next crop.',
        ],
    },
} satisfies Record<string, Content>

const legacyText = {
    city: [
        'Савва торгует к югу от площади, Арен учит магии на северо-востоке.',
        'Savva trades south of the square. Aren teaches magic to the northeast.',
    ],
    guild: [
        'Мира ищет три слизневых сердца для колокола памяти.',
        'Mira is looking for three slime hearts for the Bell of Memory.',
    ],
    chapel: [
        'Сестра Вера помогает выбрать покровителя и отпускает грехи за 30 золотых.',
        'Sister Vera helps you choose a patron and grants absolution for 30 gold.',
    ],
    market: [
        'Лавка Саввы — к юго-западу, дом Миры — к северо-западу.',
        'Savva’s shop is to the southwest. Mira’s home is to the northwest.',
    ],
    garden: [
        'Здесь живёт говорящая слизь Капля. Она тоже может стать спутником.',
        'Kaplya the talking slime lives here and may travel with you.',
    ],
} satisfies Record<string, Pair>

const directions: Record<
    WorldDirection,
    { road: Pair; gate: Pair; where: string; toward: string }
> = {
    north: {
        road: ['Северный путь', 'Northern Road'],
        gate: ['Северные ворота', 'North Gate'],
        where: 'севере',
        toward: 'север',
    },
    east: {
        road: ['Восточный путь', 'Eastern Road'],
        gate: ['Восточные ворота', 'East Gate'],
        where: 'востоке',
        toward: 'восток',
    },
    south: {
        road: ['Южный путь', 'Southern Road'],
        gate: ['Южные ворота', 'South Gate'],
        where: 'юге',
        toward: 'юг',
    },
    west: {
        road: ['Западный путь', 'Western Road'],
        gate: ['Западные ворота', 'West Gate'],
        where: 'западе',
        toward: 'запад',
    },
}

function locationEnglish(id: string): string {
    return WORLD_LOCATION_ENGLISH_NAMES[id] ?? id
}

function routeToCity(location: WorldLocationDefinition): Pair {
    if (location.id === CENTER_LOCATION_ID) {
        return [
            'Службы Новогорода отмечены на указателях. Мира принимает обращения в гильдии искателей.',
            'Follow the signs to Novogorod’s services. Mira hears requests at the Seekers’ Guild.',
        ]
    }
    const center = getWorldLocationDefinition(CENTER_LOCATION_ID) ?? location
    const legs: Array<{ distance: number; toward: WorldDirection }> = [
        {
            distance: Math.abs(center.column - location.column),
            toward: center.column > location.column ? 'east' : 'west',
        },
        {
            distance: Math.abs(center.row - location.row),
            toward: center.row > location.row ? 'south' : 'north',
        },
    ]
    const route = legs.filter(({ distance }) => distance !== 0)
    const russian = route.map(
        ({ distance, toward }) =>
            `${distance === 1 ? 'один переход' : 'два перехода'} на ${directions[toward].toward}`
    )
    const english = route.map(
        ({ distance, toward }) =>
            `${String(distance)} ${distance === 1 ? 'crossing' : 'crossings'} ${toward}`
    )
    return [
        `До города: ${russian.join(', затем ')}.`,
        `To the city: ${english.join(', then ')}.`,
    ]
}

function directionText(
    location: WorldLocationDefinition,
    direction: WorldDirection,
    gate: boolean
): Pair {
    const neighbor = worldLocationNeighbor(location.id, direction)
    const label = directions[direction]
    if (neighbor === undefined) {
        return [
            `Дальше на ${label.toward} живут драконы.`,
            `Dragons live farther ${direction}.`,
        ]
    }
    return gate
        ? [
              `За воротами — ${neighbor.name}.`,
              `Beyond the gate: ${locationEnglish(neighbor.id)}.`,
          ]
        : [
              `На ${label.where} — ${neighbor.name}.`,
              `To the ${direction}: ${locationEnglish(neighbor.id)}.`,
          ]
}

const directionNames = Object.keys(directions) as WorldDirection[]
const signsByLocation = new Map<string, Map<string, string>>()
const signs: Record<string, Pair> = {}

function add(location: string, key: string, content: Content): void {
    const id = `authored.sign.${key}`
    const local = signsByLocation.get(location) ?? new Map<string, string>()
    local.set(content.name[0], id)
    signsByLocation.set(location, local)
    signs[`${id}.name`] = content.name
    signs[`${id}.text`] = content.text
}

for (const location of WORLD_LOCATION_DEFINITIONS) {
    add(location.id, location.id, {
        name: [location.name, locationEnglish(location.id)],
        text: routeToCity(location),
    })
    for (const direction of directionNames) {
        for (const kind of ['road', 'gate'] as const) {
            add(location.id, `${location.id}-${direction}-${kind}`, {
                name: directions[direction][kind],
                text: directionText(location, direction, kind === 'gate'),
            })
        }
    }
    for (const [key, landmark] of Object.entries(landmarks)) {
        add(location.id, key, landmark)
    }
}

for (const [id, text] of Object.entries(legacyText)) {
    signs[`authored.sign.legacy-${id}.text`] = text
}

export const worldSignMessages: Readonly<Record<string, Pair>> = signs

/** Bind older readables as well as newly generated map metadata to their authored entries. */
export function worldSignPresentation(
    locationId: string,
    name: string,
    text?: string
):
    | {
          nameMessage: LocalizedMessage
          textMessage?: LocalizedMessage
      }
    | undefined {
    const id = signsByLocation.get(locationId)?.get(name)
    if (id === undefined) {
        return undefined
    }
    const legacy = Object.entries(legacyText).find(
        ([, pair]) => pair[0] === text
    )
    const textKey =
        legacy === undefined
            ? `${id}.text`
            : `authored.sign.legacy-${legacy[0]}.text`
    return {
        nameMessage: { key: `${id}.name` },
        ...(text === undefined || worldSignMessages[textKey]?.[0] === text
            ? { textMessage: { key: textKey } }
            : {}),
    }
}
