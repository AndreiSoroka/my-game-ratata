export interface TiledLandmark {
    id?: number
    width?: number
    height?: number
    properties?: { name: string; value: string | number | boolean }[]
    name: string
    point?: boolean
    type?: string
    visible?: boolean
    x: number
    y: number
}
