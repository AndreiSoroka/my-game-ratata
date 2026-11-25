export interface Point {
    x: number
    y: number
}

export interface Basin {
    map: string
    camera: Point
    shore: Point
    northBank: Point
    insideCorner: Point
    insideCornerShadow: Point
    center: Point
    land: Point
}

export const pond: Basin = {
    map: 'map-1-1.json',
    camera: { x: 1140, y: 151 },
    shore: { x: 1126, y: 168 },
    northBank: { x: 1163, y: 142 },
    insideCorner: { x: 1141, y: 144 },
    insideCornerShadow: { x: 1144, y: 157 },
    center: { x: 1160, y: 152 },
    land: { x: 1118, y: 152 },
}
export const lake: Basin = {
    map: 'map-0-1.json',
    camera: { x: 1043, y: 119 },
    shore: { x: 1030, y: 136 },
    northBank: { x: 1053, y: 111 },
    insideCorner: { x: 1045, y: 112 },
    insideCornerShadow: { x: 1048, y: 125 },
    center: { x: 1064, y: 120 },
    land: { x: 1021, y: 120 },
}
