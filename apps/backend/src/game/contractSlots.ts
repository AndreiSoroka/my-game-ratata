/** Active contracts have one owner group and a unique instance ID. */
export class ContractSlots {
    private readonly owners = new Map<string, string>()
    private readonly groups = new Map<string, Set<string>>()

    public idsFor(key: string): ReadonlySet<string> {
        return this.groups.get(key) ?? new Set()
    }

    public owns(key: string, id: string): boolean {
        return this.owners.get(id) === key
    }

    public claim(key: string, id: string): boolean {
        if (this.owners.has(id)) {
            return false
        }
        this.owners.set(id, key)
        const ids = this.groups.get(key) ?? new Set<string>()
        ids.add(id)
        this.groups.set(key, ids)
        return true
    }

    public release(id: string): void {
        const key = this.owners.get(id)
        if (key === undefined) {
            return
        }
        this.owners.delete(id)
        const ids = this.groups.get(key)
        ids?.delete(id)
        if (ids?.size === 0) {
            this.groups.delete(key)
        }
    }

    public move(from: string, to: string): void {
        if (from === to) {
            return
        }
        for (const id of this.idsFor(from)) {
            this.release(id)
            this.claim(to, id)
        }
    }

    public hasId(id: string): boolean {
        return this.owners.has(id)
    }

    public keyFor(id: string): string | undefined {
        return this.owners.get(id)
    }
}
