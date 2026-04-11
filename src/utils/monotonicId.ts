export function createMonotonicIdGenerator() {
  let lastIssuedId = 0

  return (seed = Date.now()) => {
    const nextId = Number.isFinite(seed) ? Math.trunc(seed) : Date.now()

    if (nextId <= lastIssuedId) {
      lastIssuedId += 1
      return lastIssuedId
    }

    lastIssuedId = nextId
    return lastIssuedId
  }
}
