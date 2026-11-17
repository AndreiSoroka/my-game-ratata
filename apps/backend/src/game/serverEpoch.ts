/** One epoch per backend process; receipt counters may restart with a new world. */
export const serverEpoch = crypto.randomUUID()
