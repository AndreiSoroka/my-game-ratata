import {
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '../contracts/src/world.ts'

const cityText = {
    'Лавка Саввы': 'Савва продаёт еду, мечи и сапоги.',
    'Гильдия искателей': 'Мира ищет три слизневых сердца для колокола памяти.',
    'Часовня памяти':
        'Сестра Вера помогает выбрать покровителя и отпускает грехи за 30 золотых.',
    'Городская библиотека':
        'Арен обучает огненному шару. Здесь можно прочесть три главы о магии.',
    'Таверна «Три дороги»':
        'Здесь останавливаются Бран и Лея. Познакомьтесь, прежде чем звать их в путь.',
    Мастерские:
        'Мастерица Мила работает у станка. Волокно для ремесла найдётся у площади.',
    Кузница: 'Здесь работает кузнец Игнат. Металл для ремесла ищите у площади.',
    'Торговые ряды': 'Лавка Саввы — к юго-западу, дом Миры — к северо-западу.',
    'Лекарский сад':
        'Здесь живёт говорящая слизь Капля. Она тоже может стать спутником.',
    'Площадь Новогорода':
        'Стражница Рада принимает жалобы на замеченных воров.',
    'Тренировочный загон':
        'Внутри ограды видны области атак и точный урон по манекену.',
}
const directions = [
    { prefix: 'Восточ', dx: 1, dy: 0, where: 'востоке', toward: 'восток' },
    { prefix: 'Запад', dx: -1, dy: 0, where: 'западе', toward: 'запад' },
    { prefix: 'Север', dx: 0, dy: -1, where: 'севере', toward: 'север' },
    { prefix: 'Юж', dx: 0, dy: 1, where: 'юге', toward: 'юг' },
]

/** Short authored information, shared by generation and metadata-only migrations. */
export function signText(location, name) {
    if (name === location.name) return routeToCity(location)
    if (cityText[name]) return cityText[name]
    if (name === 'Пшеничная ферма')
        return 'Созревшую пшеницу можно собрать. Засейте пустую грядку для следующего урожая.'
    const direction = directions.find((entry) => name.startsWith(entry.prefix))
    if (!direction) throw new Error(`Missing sign text: ${location.id}/${name}`)
    const next = WORLD_LOCATION_DEFINITIONS.find(
        (entry) =>
            entry.column === location.column + direction.dx &&
            entry.row === location.row + direction.dy
    )
    if (!next) return `Дальше на ${direction.toward} живут драконы.`
    return name.endsWith('ворота')
        ? `За воротами — ${next.name}.`
        : `На ${direction.where} — ${next.name}.`
}

function routeToCity(location) {
    if (location.id === CENTER_LOCATION_ID)
        return 'Савва торгует к югу от площади, Арен учит магии на северо-востоке.'
    const center = WORLD_LOCATION_DEFINITIONS.find(
        (entry) => entry.id === CENTER_LOCATION_ID
    )
    const legs = [
        [center.column - location.column, 'восток', 'запад'],
        [center.row - location.row, 'юг', 'север'],
    ]
        .filter(([distance]) => distance !== 0)
        .map(
            ([distance, positive, negative]) =>
                `${Math.abs(distance) === 1 ? 'один переход' : 'два перехода'} на ${distance > 0 ? positive : negative}`
        )
    return `До города: ${legs.join(', затем ')}.`
}
