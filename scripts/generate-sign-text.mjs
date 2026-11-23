import {
    worldSignMessages,
    worldSignPresentation,
} from '../contracts/src/worldSignText.ts'

export function signContent(location, name) {
    const presentation = worldSignPresentation(location.id, name)
    if (!presentation?.textMessage)
        throw new Error(`Missing sign text: ${location.id}/${name}`)
    const nameKey = presentation.nameMessage.key
    const textKey = presentation.textMessage.key
    return { nameKey, textKey, text: worldSignMessages[textKey][0] }
}
