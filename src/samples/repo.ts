import type { Take } from './types'

/** Storage seam: swap for a Firebase-backed implementation when deployed. */
export interface TakeRepository {
  list(): Promise<Take[]>
  put(take: Take): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

const DB = 'breathdeck'
const STORE = 'takes'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const r = f(db.transaction(STORE, mode).objectStore(STORE))
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      }),
  )
}

export class LocalTakeRepository implements TakeRepository {
  list() {
    return tx<Take[]>('readonly', (s) => s.getAll())
  }
  async put(take: Take) {
    await tx('readwrite', (s) => s.put(take))
  }
  async remove(id: string) {
    await tx('readwrite', (s) => s.delete(id))
  }
  async clear() {
    await tx('readwrite', (s) => s.clear())
  }
}
