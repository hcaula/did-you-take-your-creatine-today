export type ISODate = `${number}-${number}-${number}` // YYYY-MM-DD (local)

export type SaveDataV1 = {
  version: 1
  startDate: ISODate
  taken: Record<ISODate, boolean>
  updatedAt: number
}

export const STORAGE_KEY = 'creatine-tracker:v1'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function isISODateKey(v: unknown): v is ISODate {
  if (typeof v !== 'string') return false
  // Basic guard; we also rely on parsing/formatting to normalize.
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function toISODateKeyLocal(d: Date): ISODate {
  // Use local calendar date
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${pad2(m)}-${pad2(day)}` as ISODate
}

export function makeLocalNoonDateFromISO(key: ISODate): Date {
  const [yStr, mStr, dStr] = key.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const d = Number(dStr)
  // Noon avoids DST midnight edge cases when iterating day-by-day.
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function addDaysLocalNoon(d: Date, deltaDays: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + deltaDays)
  return copy
}

export function formatHumanDate(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

export function compareISODate(a: ISODate, b: ISODate) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function getTodayKey(): ISODate {
  return toISODateKeyLocal(new Date())
}

export function getHumanToday() {
  return formatHumanDate(new Date())
}

export function makeDefaultSave(today: ISODate = getTodayKey()): SaveDataV1 {
  return {
    version: 1,
    startDate: today,
    taken: {},
    updatedAt: Date.now(),
  }
}

export function loadSave(): SaveDataV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return makeDefaultSave()
    const parsed: unknown = JSON.parse(raw)
    const coerced = coerceSave(parsed)
    return coerced ?? makeDefaultSave()
  } catch {
    return makeDefaultSave()
  }
}

export function saveToStorage(data: SaveDataV1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }))
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

export function coerceSave(input: unknown): SaveDataV1 | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (obj.version !== 1) return null
  if (!isISODateKey(obj.startDate)) return null
  const takenRaw = obj.taken
  if (!takenRaw || typeof takenRaw !== 'object') return null

  const taken: Record<ISODate, boolean> = {}
  for (const [k, v] of Object.entries(takenRaw as Record<string, unknown>)) {
    if (!isISODateKey(k)) continue
    if (typeof v !== 'boolean') continue
    taken[k as ISODate] = v
  }

  return {
    version: 1,
    startDate: obj.startDate as ISODate,
    taken,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
  }
}

export function ensureStartDate(save: SaveDataV1, candidate: ISODate) {
  if (!save.startDate) return { ...save, startDate: candidate }
  if (compareISODate(candidate, save.startDate) < 0) return { ...save, startDate: candidate }
  return save
}

export function buildHistoryKeysInclusive(start: ISODate, end: ISODate): ISODate[] {
  const startD = makeLocalNoonDateFromISO(start)
  const endD = makeLocalNoonDateFromISO(end)
  const out: ISODate[] = []
  for (let d = endD; d >= startD; d = addDaysLocalNoon(d, -1)) {
    out.push(toISODateKeyLocal(d))
  }
  return out
}

export type StreakInfo = {
  length: number
  start: ISODate | null
  end: ISODate | null
}

export function computeCurrentStreak(save: SaveDataV1, today: ISODate): StreakInfo {
  if (!save.taken[today]) return { length: 0, start: null, end: null }
  let len = 0
  let cursor = makeLocalNoonDateFromISO(today)
  while (true) {
    const key = toISODateKeyLocal(cursor)
    if (!save.taken[key]) break
    len += 1
    cursor = addDaysLocalNoon(cursor, -1)
  }
  const startKey = toISODateKeyLocal(addDaysLocalNoon(cursor, 1))
  return { length: len, start: startKey, end: today }
}

export function computeBestStreak(save: SaveDataV1, start: ISODate, end: ISODate): StreakInfo {
  const keysAsc = buildHistoryKeysInclusive(start, end).slice().reverse()
  let bestLen = 0
  let bestStart: ISODate | null = null
  let bestEnd: ISODate | null = null

  let runLen = 0
  let runStart: ISODate | null = null

  for (const k of keysAsc) {
    if (save.taken[k]) {
      if (runLen === 0) runStart = k
      runLen += 1
      if (runLen > bestLen) {
        bestLen = runLen
        bestStart = runStart
        bestEnd = k
      }
    } else {
      runLen = 0
      runStart = null
    }
  }

  return { length: bestLen, start: bestStart, end: bestEnd }
}


