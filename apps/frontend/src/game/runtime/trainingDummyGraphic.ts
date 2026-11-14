import { Canvas } from 'excalibur'

/** Static wood and straw figure; no animated sheet or gameplay state. */
export function trainingDummyGraphic(): Canvas {
    return new Canvas({
        width: 48,
        height: 48,
        cache: true,
        smoothing: false,
        draw: (ctx) => {
            ctx.fillStyle = '#302c2060'
            ctx.fillRect(11, 34, 26, 4)
            ctx.fillStyle = '#513b29'
            ctx.fillRect(22, 5, 4, 32)
            ctx.fillRect(9, 16, 30, 4)
            ctx.fillStyle = '#b79752'
            ctx.fillRect(17, 10, 14, 19)
            ctx.fillRect(19, 2, 10, 10)
            ctx.fillStyle = '#d4b76b'
            ctx.fillRect(18, 11, 3, 16)
            ctx.fillRect(20, 3, 8, 6)
            ctx.fillStyle = '#78613a'
            ctx.fillRect(16, 21, 16, 3)
            ctx.fillRect(20, 12, 1, 8)
            ctx.fillRect(27, 12, 1, 8)
            ctx.fillStyle = '#513b29'
            ctx.fillRect(21, 6, 1, 2)
            ctx.fillRect(26, 6, 1, 2)
            ctx.fillRect(18, 35, 12, 2)
        },
    })
}
