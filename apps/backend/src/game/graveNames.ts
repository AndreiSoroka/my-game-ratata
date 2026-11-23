const buriedNames = [
    'Агафон',
    'Борислав',
    'Велимир',
    'Гордей',
    'Данила',
    'Елисей',
    'Ждан',
    'Захар',
    'Мирон',
    'Назар',
    'Платон',
    'Ратибор',
    'Савелий',
    'Тихон',
    'Фёдор',
    'Яромир',
] as const

/** Resolve once at registration without consuming the simulation's random stream. */
export function resolveBuriedName(id: string, supplied?: string): string {
    if (supplied !== undefined && supplied.trim().length > 0) {
        return supplied
    }
    let hash = 2166136261
    for (let index = 0; index < id.length; index++) {
        hash = Math.imul(hash ^ id.charCodeAt(index), 16777619)
    }
    return buriedNames[(hash >>> 0) % buriedNames.length] ?? buriedNames[0]
}
