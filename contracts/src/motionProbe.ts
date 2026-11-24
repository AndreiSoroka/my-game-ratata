export interface MotionPingClientMessage {
    type: 'motion_ping'
    id: number
}

export interface MotionPongServerMessage {
    type: 'motion_pong'
    id: number
    /** Gameplay clock sampled at receipt of the WebSocket probe. */
    serverReceivedAt: number
}
