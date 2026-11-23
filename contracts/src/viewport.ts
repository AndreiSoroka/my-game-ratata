/** A rendering interest hint in world pixels; it never grants gameplay visibility. */
export interface ViewportBounds {
    left: number
    top: number
    right: number
    bottom: number
}

export interface SetViewportClientMessage {
    type: 'set_viewport'
    locationId: string
    bounds: ViewportBounds
}
