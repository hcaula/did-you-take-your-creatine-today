export type ISODate = `${number}-${number}-${number}` // YYYY-MM-DD (local)

export type SaveDataV1 = {
  version: 1
  startDate: ISODate
  taken: Record<ISODate, boolean>
  updatedAt: number
}

export type TakenAt = number | null

export type SaveDataV2 = {
  version: 2
  startDate: ISODate
  // Presence of key means "taken". Value is ms timestamp (local entry time) or null if unknown.
  taken: Record<ISODate, TakenAt>
  updatedAt: number
}

export type SaveData = SaveDataV2

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

export function formatHumanTime(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
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

export function makeDefaultSave(today: ISODate = getTodayKey()): SaveDataV2 {
  return {
    version: 2,
    startDate: today,
    taken: {},
    updatedAt: Date.now(),
  }
}

export function loadSave(): SaveDataV2 {
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

export function saveToStorage(data: SaveDataV2) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }))
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

export function coerceSave(input: unknown): SaveDataV2 | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (!isISODateKey(obj.startDate)) return null
  const takenRaw = obj.taken
  if (!takenRaw || typeof takenRaw !== 'object') return null

  // v2 (preferred)
  if (obj.version === 2) {
    const taken: Record<ISODate, TakenAt> = {}
    for (const [k, v] of Object.entries(takenRaw as Record<string, unknown>)) {
      if (!isISODateKey(k)) continue
      if (typeof v === 'number') taken[k as ISODate] = v
      else if (v === null) taken[k as ISODate] = null
      // ignore booleans/other unexpected values
    }
    return {
      version: 2,
      startDate: obj.startDate as ISODate,
      taken,
      updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    }
  }

  // v1 -> migrate (true => taken with unknown time)
  if (obj.version === 1) {
    const taken: Record<ISODate, TakenAt> = {}
    for (const [k, v] of Object.entries(takenRaw as Record<string, unknown>)) {
      if (!isISODateKey(k)) continue
      if (v === true) taken[k as ISODate] = null
    }
    return {
      version: 2,
      startDate: obj.startDate as ISODate,
      taken,
      updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    }
  }

  return null
}

export function ensureStartDate(save: SaveDataV2, candidate: ISODate) {
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

export function isTaken(save: SaveDataV2, key: ISODate) {
  return Object.prototype.hasOwnProperty.call(save.taken, key)
}

export function computeCurrentStreak(save: SaveDataV2, today: ISODate): StreakInfo {
  // "Current streak" is the most recent consecutive run up to today.
  // If today isn't taken yet, we allow the streak to end yesterday (so users don't lose the
  // streak during the day). It only drops to 0 once there's a full-day gap.
  const todayTaken = isTaken(save, today)
  const startCursor = todayTaken
    ? makeLocalNoonDateFromISO(today)
    : addDaysLocalNoon(makeLocalNoonDateFromISO(today), -1)

  const startKey = toISODateKeyLocal(startCursor)
  if (!isTaken(save, startKey)) return { length: 0, start: null, end: null }

  let len = 0
  let cursor = startCursor
  while (true) {
    const key = toISODateKeyLocal(cursor)
    if (!isTaken(save, key)) break
    len += 1
    cursor = addDaysLocalNoon(cursor, -1)
  }
  const runStartKey = toISODateKeyLocal(addDaysLocalNoon(cursor, 1))
  const runEndKey = toISODateKeyLocal(startCursor)
  return { length: len, start: runStartKey, end: runEndKey }
}

export function computeBestStreak(save: SaveDataV2, start: ISODate, end: ISODate): StreakInfo {
  const keysAsc = buildHistoryKeysInclusive(start, end).slice().reverse()
  let bestLen = 0
  let bestStart: ISODate | null = null
  let bestEnd: ISODate | null = null

  let runLen = 0
  let runStart: ISODate | null = null

  for (const k of keysAsc) {
    if (isTaken(save, k)) {
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


