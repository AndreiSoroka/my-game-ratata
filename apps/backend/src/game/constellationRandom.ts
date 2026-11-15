/** Private layout randomness never advances combat, loot or practice randomness. */
export function constellationRandom(seed: string): () => number {
    let a = 0x9e3779b9,
        b = 0x85ebca6b,
        c = 0xc2b2ae35,
        d = 0x27d4eb2f
    for (const symbol of seed) {
        const value = symbol.codePointAt(0) ?? 0
        a = Math.imul(a ^ value, 16777619) >>> 0
        b = Math.imul(b ^ value, 2246822519) >>> 0
        c = Math.imul(c ^ value, 3266489917) >>> 0
        d = Math.imul(d ^ value, 668265263) >>> 0
    }
    return () => {
        const product = Math.imul(b, 5)
        const result = Math.imul((product << 7) | (product >>> 25), 9) >>> 0
        const shifted = b << 9
        c ^= a
        d ^= b
        b ^= c
        a ^= d
        c ^= shifted
        d = (d << 11) | (d >>> 21)
        return result / 4294967296
    }
}
