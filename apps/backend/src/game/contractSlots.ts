/** A single group contract slot shared by authored, worker and model contracts. */
export class ContractSlots {
    private readonly claims = new Map<string, string>()

    public get(key: string): string | undefined {
        return this.claims.get(key)
    }

    public claim(key: string, id: string): boolean {
        if (this.claims.has(key)) {
            return false
        }
        this.claims.set(key, id)
        return true
    }

    public release(id: string): void {
        for (const [key, value] of this.claims) {
            if (value === id) {
                this.claims.delete(key)
            }
        }
    }

    public move(from: string, to: string): void {
        const id = this.claims.get(from)
        if (id !== undefined) {
            this.claims.set(to, id)
            this.claims.delete(from)
        }
    }

    public hasId(id: string): boolean {
        return [...this.claims.values()].includes(id)
    }

    public keyFor(id: string): string | undefined {
        return [...this.claims].find(([, value]) => value === id)?.[0]
    }
}
