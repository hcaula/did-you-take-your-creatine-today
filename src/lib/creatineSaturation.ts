import {
  addDaysLocalNoon,
  compareISODate,
  isTaken,
  makeLocalNoonDateFromISO,
  toISODateKeyLocal,
  type ISODate,
  type SaveData,
} from "./creatine"

/**
 * Profile for the saturation model (ISSN-style maintenance ~0.03–0.04 g/kg for most adults).
 * Dose efficiency is capped at 1.0 so intakes at or above the reference maintenance reach the same asymptote.
 */
export const SATURATION_PROFILE = {
  ageYears: 30,
  bodyMassKg: 75,
  /** Grams per supplemented day (your scoop). */
  doseGrams: 6,
} as const

/** Reference maintenance dose (g/day) used to normalize intake; ~3 g aligns with ~0.04 g/kg at 75 kg. */
const REFERENCE_MAINTENANCE_G_PER_DAY = 0.04 * SATURATION_PROFILE.bodyMassKg

/**
 * ~95% of the dose asymptote (`step`); projections stop here (not chasing the last few %).
 */
const ESTIMATED_DAILY_TARGET_FRACTION_OF_STEP = 0.95

/**
 * Calibrate the discrete pool so consecutive daily maintenance-equivalent dosing (step ≈ 1)
 * rises from 0 → ~95% in this many days—aligned with common “~3–4 weeks to saturate” without
 * loading. (Using creatine *elimination* half-life for this same `k` made uptake unrealistically slow.)
 */
const SATURATION_FILL_DAYS_FROM_ZERO = 28

/** Fraction of the gap closed each day in the one-compartment update (pairs with constants above). */
const DAILY_FRACTION =
  1 -
  Math.pow(
    1 - ESTIMATED_DAILY_TARGET_FRACTION_OF_STEP,
    1 / SATURATION_FILL_DAYS_FROM_ZERO,
  )

function doseEfficiency(grams: number): number {
  return Math.min(1, grams / REFERENCE_MAINTENANCE_G_PER_DAY)
}

function buildDateRangeAscending(from: ISODate, to: ISODate): ISODate[] {
  if (compareISODate(from, to) > 0) return []
  const out: ISODate[] = []
  for (
    let d = makeLocalNoonDateFromISO(from);
    compareISODate(toISODateKeyLocal(d), to) <= 0;
    d = addDaysLocalNoon(d, 1)
  ) {
    out.push(toISODateKeyLocal(d))
  }
  return out
}

export type SaturationPoint = {
  date: ISODate
  /** 0–100; fraction of modeled maximal muscle creatine saturation from supplementation. */
  percent: number
}

/**
 * Discrete one-compartment update: each day the pool moves a fraction DAILY_FRACTION toward
 * "on" (1) if you supplemented, or "off" (0) if you did not. Steady state with daily dosing is 100%.
 */
export function computeSaturationSeries(
  save: SaveData,
  from: ISODate,
  to: ISODate,
  options: { doseGrams?: number } = {},
): SaturationPoint[] {
  const grams = options.doseGrams ?? SATURATION_PROFILE.doseGrams
  const step = doseEfficiency(grams)
  const dates = buildDateRangeAscending(from, to)
  const series: SaturationPoint[] = []
  let pool = 0

  for (const date of dates) {
    const toward = isTaken(save, date) ? 1 : 0
    pool =
      (1 - DAILY_FRACTION) * pool + DAILY_FRACTION * step * toward
    pool = Math.max(0, Math.min(1, pool))
    series.push({
      date,
      percent: Math.round(pool * 1000) / 10,
    })
  }

  return series
}

/** 100 on the same scale as `percent` in SaturationPoint — ceiling for full saturation. */
export const SATURATION_TARGET_PERCENT = 100

const MAX_PROJECTION_DAYS = 2000

export type EstimatedDailySaturationResult =
  | { kind: "already_saturated" }
  | { kind: "date"; date: ISODate; daysAhead: number }

/**
 * From the current modeled pool (end of `todayKey`), simulate taking the reference dose every day
 * and return the first calendar day the pool reaches ~95% of the modeled asymptote for that dose,
 * or `already_saturated` if already there.
 */
export function estimateSaturationDateIfDailyFromPool(
  poolFraction: number,
  todayKey: ISODate,
  options: { doseGrams?: number } = {},
): EstimatedDailySaturationResult {
  const grams = options.doseGrams ?? SATURATION_PROFILE.doseGrams
  const step = doseEfficiency(grams)
  let pool = Math.max(0, Math.min(1, poolFraction))
  const targetPool = step * ESTIMATED_DAILY_TARGET_FRACTION_OF_STEP

  if (pool >= targetPool) {
    return { kind: "already_saturated" }
  }

  let cursor = addDaysLocalNoon(makeLocalNoonDateFromISO(todayKey), 1)
  let daysAhead = 0

  while (pool < targetPool && daysAhead < MAX_PROJECTION_DAYS) {
    pool = (1 - DAILY_FRACTION) * pool + DAILY_FRACTION * step * 1
    pool = Math.max(0, Math.min(1, pool))
    daysAhead += 1
    if (pool >= targetPool) {
      return { kind: "date", date: toISODateKeyLocal(cursor), daysAhead }
    }
    cursor = addDaysLocalNoon(cursor, 1)
  }

  return { kind: "date", date: toISODateKeyLocal(cursor), daysAhead }
}
