import { star } from './constellationDefinition'

function practiceStar(
    path: 'shadow' | 'theft',
    id: string,
    name: string,
    description: string,
    parent: string,
    minimumLevel: number
) {
    return {
        ...star(
            path,
            id,
            name,
            description,
            [parent],
            [path === 'shadow' ? 'stealth' : 'theft']
        ),
        minimumLevel,
    }
}

export const stealthTheftStars = [
    practiceStar(
        'shadow',
        'speed',
        'Плавный шаг',
        'Скорость крадучись увеличена на 10%.',
        'root',
        1
    ),
    practiceStar(
        'shadow',
        'speed2',
        'Мягкий перенос',
        'Скорость крадучись увеличена ещё на 5%.',
        'speed',
        3
    ),
    practiceStar(
        'shadow',
        'speed3',
        'Скользящий шаг',
        'Скорость крадучись увеличена ещё на 5%.',
        'speed2',
        6
    ),
    practiceStar(
        'shadow',
        'noise1',
        'Тихая поступь',
        'Радиус шума шагов крадучись уменьшен на 15%.',
        'root',
        1
    ),
    practiceStar(
        'shadow',
        'noise2',
        'Глухая подошва',
        'Радиус шума шагов крадучись уменьшен ещё на 10%.',
        'noise1',
        3
    ),
    practiceStar(
        'shadow',
        'noise3',
        'Мягкая опора',
        'Радиус шума шагов крадучись уменьшен ещё на 10%.',
        'noise2',
        6
    ),
    practiceStar(
        'shadow',
        'sight',
        'На краю взгляда',
        'Дистанция обнаружения крадущегося уменьшена на 10%.',
        'root',
        1
    ),
    practiceStar(
        'shadow',
        'sight2',
        'Линия тени',
        'Дистанция обнаружения крадущегося уменьшена ещё на 5%.',
        'sight',
        3
    ),
    practiceStar(
        'shadow',
        'sight3',
        'Раствориться в тени',
        'Дистанция обнаружения крадущегося уменьшена ещё на 5%.',
        'sight2',
        6
    ),
    practiceStar(
        'theft',
        'luck1',
        'Незаметное касание',
        'Если вас не заметили, шанс достать предмет выше на 2 процентных пункта.',
        'root',
        1
    ),
    practiceStar(
        'theft',
        'luck2',
        'Искусство карманника',
        'Если вас не заметили, шанс достать предмет выше ещё на 2 процентных пункта.',
        'luck1',
        3
    ),
    practiceStar(
        'theft',
        'luck3',
        'Точный захват',
        'Если вас не заметили, шанс достать предмет выше ещё на 4 процентных пункта.',
        'luck2',
        6
    ),
    practiceStar(
        'theft',
        'composure1',
        'Слепая сторона',
        'При попытке со спины шанс поимки ниже на 1 процентный пункт.',
        'root',
        1
    ),
    practiceStar(
        'theft',
        'composure2',
        'Чутьё на поворот',
        'При попытке со спины шанс поимки ниже ещё на 1 процентный пункт.',
        'composure1',
        3
    ),
    practiceStar(
        'theft',
        'composure3',
        'Рука в тени',
        'При попытке со спины шанс поимки ниже ещё на 2 процентных пункта.',
        'composure2',
        6
    ),
    practiceStar(
        'theft',
        'economy',
        'Ловкие пальцы',
        'Попытка кражи стоит на 1 EN меньше.',
        'root',
        1
    ),
    practiceStar(
        'theft',
        'tempo',
        'Быстрые руки',
        'Общий кулдаун кражи короче на секунду. Повтор у той же цели возможен через минуту.',
        'economy',
        3
    ),
    practiceStar(
        'theft',
        'rhythm',
        'Выверенный ритм',
        'Попытка кражи стоит ещё на 1 EN меньше, общий кулдаун короче ещё на секунду. Повтор у той же цели возможен через минуту.',
        'tempo',
        6
    ),
]
