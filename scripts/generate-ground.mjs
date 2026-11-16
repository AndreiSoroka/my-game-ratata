import fs from 'node:fs'
import path from 'node:path'

export const pavingGid = 1024
export const woodenFloorGid = 1025
export const soilGid = 1026
export const doorwayGid = 1029

export function writeGroundTilesets(mapRoot) {
    const target = path.join(mapRoot, 'assets/Novogorod')
    fs.mkdirSync(target, { recursive: true })
    // Flat, low-contrast top-down slabs; no wall stones, highlights or raised edges.
    fs.writeFileSync(
        path.join(target, 'paving.svg'),
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#818b83" d="M0 0h16v16H0z"/><path fill="#89938a" d="M1 1h6v6H1zM9 9h6v6H9z"/><path fill="#859087" d="M9 1h6v6H9zM1 9h6v6H1z"/><path fill="#758078" d="M0 0h16v1H0zM0 8h16v1H0zM0 0h1v16H0zM8 0h1v16H8z"/></svg>\n`
    )
    fs.writeFileSync(
        path.join(target, 'soil.svg'),
        `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="16" viewBox="0 0 48 16" shape-rendering="crispEdges"><path fill="#bd8055" d="M4 4h12v10H4zM2 6h2v6H2zM16 4h16v10H16zM32 4h12v10H32zM44 6h2v6H44z"/><path fill="#d99d68" d="M5 5h11v7H5zM3 7h2v3H3zM16 5h16v7H16zM32 5h11v7H32zM43 7h2v3H43z"/><path fill="#e8b681" d="M6 6h2v1H6zM11 9h2v1H11zM19 6h3v1H19zM26 9h2v1H26zM34 7h2v1H34zM39 10h2v1H39z"/></svg>\n`
    )
    fs.writeFileSync(
        path.join(target, 'doorway.svg'),
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#403c31" d="M0 0h16v16H0z"/></svg>\n`
    )
    const directory = path.join(mapRoot, 'tilesets/Novogorod')
    fs.mkdirSync(directory, { recursive: true })
    for (const [name, image] of [
        ['paving', '../../assets/Novogorod/paving.svg'],
        ['wooden', '../../assets/MysticWoods/tilesets/floors/wooden.png'],
    ]) {
        fs.writeFileSync(
            path.join(directory, `${name}.json`),
            JSON.stringify(
                {
                    columns: 1,
                    image,
                    imageheight: 16,
                    imagewidth: 16,
                    margin: 0,
                    name,
                    spacing: 0,
                    tilecount: 1,
                    tiledversion: '1.11.2',
                    tileheight: 16,
                    tilewidth: 16,
                    type: 'tileset',
                    version: '1.10',
                },
                null,
                2
            ) + '\n'
        )
    }
    for (const [name, columns] of [
        ['soil', 3],
        ['doorway', 1],
    ]) {
        fs.writeFileSync(
            path.join(directory, `${name}.json`),
            JSON.stringify(
                {
                    columns,
                    image: `../../assets/Novogorod/${name}.svg`,
                    imageheight: 16,
                    imagewidth: columns * 16,
                    margin: 0,
                    name,
                    spacing: 0,
                    tilecount: columns,
                    tiledversion: '1.11.2',
                    tileheight: 16,
                    tilewidth: 16,
                    type: 'tileset',
                    version: '1.10',
                },
                null,
                2
            ) + '\n'
        )
    }
}
