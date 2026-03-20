import "./App.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDaysLocalNoon,
  calendarMonthBounds,
  calendarYearBounds,
  clearStorage,
  coerceSave,
  compareISODate,
  computeBestStreak,
  computeCurrentStreak,
  countCalendarDaysInclusive,
  countTakenInRange,
  ensureStartDate,
  formatHumanDate,
  formatHumanTime,
  getTodayKey,
  intersectTrackingWindow,
  isTaken,
  makeDefaultSave,
  makeLocalNoonDateFromISO,
  saveToStorage,
  type ISODate,
  type SaveData,
} from "./lib/creatine";

function App() {
  const [save, setSave] = useState<SaveData>(() => {
    try {
      const raw = localStorage.getItem("creatine-tracker:v1");
      if (!raw) return makeDefaultSave();
      const parsed: unknown = JSON.parse(raw);
      return coerceSave(parsed) ?? makeDefaultSave();
    } catch {
      return makeDefaultSave();
    }
  });

  const [toast, setToast] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showInitialDate, setShowInitialDate] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState<string>(() => {
    try {
      const raw = localStorage.getItem("creatine-tracker:v1");
      if (!raw) return getTodayKey();
      const parsed: unknown = JSON.parse(raw);
      const coerced = coerceSave(parsed);
      return coerced?.startDate ?? getTodayKey();
    } catch {
      return getTodayKey();
    }
  });
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const [today, setToday] = useState(getTodayKey);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        const currentToday = getTodayKey();
        setToday((prev) => (prev !== currentToday ? currentToday : prev));
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const closeSettingsMenu = useCallback(() => {
    setShowSettings(false);
    setShowInitialDate(false);
    setStartDateError(null);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        closeSettingsMenu();
      }
    }
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSettings, closeSettingsMenu]);

  const todayTaken = isTaken(save, today);
  const todayTakenAt = todayTaken ? save.taken[today] : undefined;

  useEffect(() => {
    saveToStorage(save);
  }, [save]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const startDate = save.startDate ?? today;

  useEffect(() => {
    setStartDateDraft(save.startDate ?? today);
  }, [save.startDate, today]);

  const [calendarMonthKey, setCalendarMonthKey] = useState(() =>
    getTodayKey().slice(0, 7),
  );

  const monthNavBounds = useMemo(() => {
    const startD = makeLocalNoonDateFromISO(startDate);
    const endD = makeLocalNoonDateFromISO(today);
    return {
      min: `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}`,
      max: `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}`,
    };
  }, [startDate, today]);

  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    const sunday = new Date(2024, 5, 2, 12);
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(addDaysLocalNoon(sunday, i)),
    );
  }, []);

  const calendarCells = useMemo(() => {
    const [yStr, mStr] = calendarMonthKey.split("-");
    const y = Number(yStr);
    const monthIndex = Number(mStr) - 1;
    const first = new Date(y, monthIndex, 1, 12, 0, 0, 0);
    const daysInMonth = new Date(y, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
    const lead = first.getDay();
    const pad = (n: number) => String(n).padStart(2, "0");
    const cells: Array<{
      key: string;
      iso: ISODate;
      inRange: boolean;
      label: number;
    } | null> = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${pad(monthIndex + 1)}-${pad(d)}` as ISODate;
      const inRange =
        compareISODate(iso, startDate) >= 0 && compareISODate(iso, today) <= 0;
      cells.push({ key: iso, iso, inRange, label: d });
    }
    return cells;
  }, [calendarMonthKey, startDate, today]);

  const displayMonthLabel = useMemo(() => {
    const [yStr, mStr] = calendarMonthKey.split("-");
    const d = new Date(Number(yStr), Number(mStr) - 1, 1, 12);
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(d);
  }, [calendarMonthKey]);

  function shiftActivityMonth(delta: number) {
    const [yStr, mStr] = calendarMonthKey.split("-");
    const next = new Date(Number(yStr), Number(mStr) - 1 + delta, 1, 12);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (nextKey < monthNavBounds.min || nextKey > monthNavBounds.max) return;
    setCalendarMonthKey(nextKey);
  }

  const canPrevMonth = calendarMonthKey > monthNavBounds.min;
  const canNextMonth = calendarMonthKey < monthNavBounds.max;

  const currentStreak = useMemo(
    () => computeCurrentStreak(save, today),
    [save, today],
  );
  const bestStreak = useMemo(
    () => computeBestStreak(save, startDate, today),
    [save, startDate, today],
  );

  const analytics = useMemo(() => {
    const trackStart = startDate;
    const trackEnd = today;
    const todayParts = makeLocalNoonDateFromISO(today);
    const y = todayParts.getFullYear();
    const m = todayParts.getMonth() + 1;

    const yBounds = calendarYearBounds(y);
    const yearWindow = intersectTrackingWindow(
      yBounds.start,
      yBounds.end,
      trackStart,
      trackEnd,
    );
    const monthWindow = intersectTrackingWindow(
      calendarMonthBounds(y, m).start,
      calendarMonthBounds(y, m).end,
      trackStart,
      trackEnd,
    );

    function windowStat(w: { from: ISODate; to: ISODate } | null) {
      if (!w) {
        return { taken: 0, trackedDays: 0, rate: null as number | null };
      }
      const trackedDays = countCalendarDaysInclusive(w.from, w.to);
      const taken = countTakenInRange(save, w.from, w.to);
      const rate =
        trackedDays > 0 ? Math.round((taken / trackedDays) * 100) : null;
      return { taken, trackedDays, rate };
    }

    const allTracked = countCalendarDaysInclusive(trackStart, trackEnd);
    const allTaken = countTakenInRange(save, trackStart, trackEnd);
    const allRate =
      allTracked > 0 ? Math.round((allTaken / allTracked) * 100) : null;

    return {
      year: windowStat(yearWindow),
      month: windowStat(monthWindow),
      allTime: {
        taken: allTaken,
        trackedDays: allTracked,
        rate: allRate,
      },
      monthHeading: new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
      }).format(new Date(y, m - 1, 1, 12)),
    };
  }, [save, startDate, today]);

  function updateDate(key: ISODate, nextTaken: boolean) {
    setSave((prev) => {
      const taken = { ...prev.taken };
      if (nextTaken) {
        taken[key] = key === today ? Date.now() : null;
      } else {
        delete taken[key];
      }

      const next: SaveData = {
        ...prev,
        taken,
        updatedAt: Date.now(),
      };
      return nextTaken ? ensureStartDate(next, key) : next;
    });
  }

  function toggleToday() {
    updateDate(today, !todayTaken);
  }

  function exportData() {
    const payload = JSON.stringify(save, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creatine-tracker-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast("Data exported");
    closeSettingsMenu();
  }

  async function importFromFile(file: File) {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const coerced = coerceSave(parsed);
      if (!coerced) {
        setImportError("Invalid save file");
        return;
      }
      setSave(coerced);
      setToast("Data imported");
      closeSettingsMenu();
    } catch {
      setImportError("Could not read file");
    }
  }

  function onPickImport() {
    importInputRef.current?.click();
  }

  function onClear() {
    if (!confirm("Clear all data? This cannot be undone.")) return;
    clearStorage();
    setSave(makeDefaultSave());
    setToast("Data cleared");
    closeSettingsMenu();
  }

  function applyStartDate() {
    setStartDateError(null);
    const candidate = startDateDraft as ISODate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateDraft)) {
      setStartDateError("Please pick a valid date");
      return;
    }
    if (compareISODate(candidate, today) > 0) {
      setStartDateError("Cannot be in the future");
      return;
    }
    if (compareISODate(candidate, startDate) > 0) {
      setStartDateError("Pick an earlier date");
      return;
    }
    setSave((prev) => ensureStartDate(prev, candidate));
    setToast("Start date updated");
    setShowInitialDate(false);
  }

  const subtitleDate = formatHumanDate(new Date());

  return (
    <div className="wellness-page">
      <div className="wellness-blob wellness-blob-1" />
      <div className="wellness-blob wellness-blob-2" />
      <div className="wellness-blob wellness-blob-3" />

      <header className="wellness-header">
        <div className="wellness-header-row">
          <div className="wellness-brand">
            <div className="wellness-icon">
              <svg viewBox="0 0 40 40" fill="none">
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M14 20l4 4 8-8"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="wellness-brand-text">
              <h1 className="wellness-title">Daily Creatine</h1>
              <p className="wellness-subtitle">{subtitleDate}</p>
            </div>
          </div>

          <div className="wellness-settings-wrap" ref={settingsRef}>
            <button
              className="wellness-settings-btn"
              onClick={() =>
                showSettings ? closeSettingsMenu() : setShowSettings(true)
              }
              aria-label="Settings"
              aria-expanded={showSettings}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>

            {showSettings && (
              <div className="wellness-settings-menu">
                <button className="wellness-settings-item" onClick={exportData}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Data
                </button>
                <button
                  className="wellness-settings-item"
                  onClick={onPickImport}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Import Data
                </button>
                <button
                  type="button"
                  className="wellness-settings-item"
                  onClick={() => {
                    setStartDateError(null);
                    if (!showInitialDate) {
                      setStartDateDraft(save.startDate ?? today);
                    }
                    setShowInitialDate(!showInitialDate);
                  }}
                  aria-expanded={showInitialDate}
                  aria-controls="wellness-settings-start-date-fields"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Tracking start date
                </button>
                {showInitialDate && (
                  <div
                    id="wellness-settings-start-date-fields"
                    className="wellness-settings-subpanel"
                  >
                    <label className="wellness-date-label">
                      First tracked day
                      <input
                        className="wellness-date-input"
                        type="date"
                        value={startDateDraft}
                        max={today}
                        onChange={(e) => {
                          setStartDateError(null);
                          setStartDateDraft(e.target.value);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="wellness-btn-sm wellness-btn-sm--menu"
                      onClick={applyStartDate}
                    >
                      Apply
                    </button>
                    {startDateError && (
                      <div className="wellness-inline-error">
                        {startDateError}
                      </div>
                    )}
                  </div>
                )}
                <div className="wellness-settings-divider" />
                <button
                  className="wellness-settings-item danger"
                  onClick={onClear}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  Clear All Data
                </button>
                {importError && (
                  <div className="wellness-settings-error">{importError}</div>
                )}
              </div>
            )}
            <input
              ref={importInputRef}
              className="sr-only"
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (file) void importFromFile(file);
              }}
            />
          </div>
        </div>
      </header>

      <main className="wellness-main">
        <section className="wellness-card wellness-status">
          <div className="wellness-status-circle">
            <div
              className={`wellness-status-inner ${todayTaken ? "done" : ""}`}
            >
              {todayTaken ? (
                <svg viewBox="0 0 24 24" fill="none" className="wellness-check">
                  <path
                    d="M5 12l5 5L19 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="wellness-plus">+</span>
              )}
            </div>
          </div>
          <div className="wellness-status-text">
            {todayTaken ? "You're all set!" : "Not yet today"}
          </div>
          {todayTaken && typeof todayTakenAt === "number" && (
            <div className="wellness-status-time">
              Taken at {formatHumanTime(new Date(todayTakenAt))}
            </div>
          )}
          <button
            className={`wellness-btn ${todayTaken ? "undo" : ""}`}
            onClick={toggleToday}
            aria-pressed={todayTaken}
          >
            {todayTaken ? "Undo" : "Mark as Taken"}
          </button>
        </section>

        <section className="wellness-streaks">
          <div className="wellness-card wellness-streak">
            <div className="wellness-streak-icon">🔥</div>
            <div className="wellness-streak-content">
              <div className="wellness-streak-num">{currentStreak.length}</div>
              <div className="wellness-streak-label">Day Streak</div>
            </div>
          </div>
          <div className="wellness-card wellness-streak best">
            <div className="wellness-streak-icon">⭐</div>
            <div className="wellness-streak-content">
              <div className="wellness-streak-num">{bestStreak.length}</div>
              <div className="wellness-streak-label">Best Streak</div>
            </div>
          </div>
        </section>

        <section className="wellness-card wellness-history">
          <div className="wellness-calendar">
            <div className="wellness-calendar-nav">
              <button
                type="button"
                className="wellness-cal-nav-btn"
                onClick={() => shiftActivityMonth(-1)}
                disabled={!canPrevMonth}
                aria-label="Previous month"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="wellness-calendar-month" aria-live="polite">
                {displayMonthLabel}
              </div>
              <button
                type="button"
                className="wellness-cal-nav-btn"
                onClick={() => shiftActivityMonth(1)}
                disabled={!canNextMonth}
                aria-label="Next month"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="wellness-cal-weekdays">
              {weekdayLabels.map((w) => (
                <div key={w} className="wellness-cal-weekday">
                  {w}
                </div>
              ))}
            </div>
            <div className="wellness-cal-grid">
              {calendarCells.map((cell, i) => {
                if (!cell) {
                  return (
                    <div
                      key={`cal-pad-${i}`}
                      className="wellness-cal-cell-wrap"
                    />
                  );
                }
                const checked = isTaken(save, cell.iso);
                const dayLabel = formatHumanDate(
                  makeLocalNoonDateFromISO(cell.iso),
                );
                if (!cell.inRange) {
                  return (
                    <div key={cell.key} className="wellness-cal-cell-wrap">
                      <div className="wellness-cal-day out" aria-hidden>
                        <span className="wellness-cal-day-num">
                          {cell.label}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={cell.key} className="wellness-cal-cell-wrap">
                    <button
                      type="button"
                      className={`wellness-cal-day ${checked ? "done" : "missed"} ${cell.iso === today ? "today" : ""}`}
                      onClick={() => updateDate(cell.iso, !checked)}
                      aria-label={
                        checked
                          ? `Creatine taken ${dayLabel}, mark as not taken`
                          : `Creatine not taken ${dayLabel}, mark as taken`
                      }
                      aria-pressed={checked}
                    >
                      <span className="wellness-cal-day-num">
                        {cell.label}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="wellness-card wellness-analytics" aria-label="Stats">
          <ul className="wellness-analytics-list">
            <li className="wellness-analytics-item">
              <div className="wellness-analytics-item-top">
                <span className="wellness-analytics-item-label">This month</span>
                <span className="wellness-analytics-item-value">
                  {analytics.month.taken} / {analytics.month.trackedDays} days
                  {analytics.month.rate != null && (
                    <span className="wellness-analytics-pct">
                      {" "}
                      · {analytics.month.rate}%
                    </span>
                  )}
                </span>
              </div>
              <div
                className="wellness-analytics-bar"
                role="presentation"
                aria-hidden
              >
                <div
                  className="wellness-analytics-bar-fill"
                  style={{
                    width: `${analytics.month.trackedDays ? (analytics.month.taken / analytics.month.trackedDays) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="wellness-analytics-item-caption">
                {analytics.monthHeading}
              </div>
            </li>
            <li className="wellness-analytics-item">
              <div className="wellness-analytics-item-top">
                <span className="wellness-analytics-item-label">This year</span>
                <span className="wellness-analytics-item-value">
                  {analytics.year.taken} / {analytics.year.trackedDays} days
                  {analytics.year.rate != null && (
                    <span className="wellness-analytics-pct">
                      {" "}
                      · {analytics.year.rate}%
                    </span>
                  )}
                </span>
              </div>
              <div
                className="wellness-analytics-bar"
                role="presentation"
                aria-hidden
              >
                <div
                  className="wellness-analytics-bar-fill wellness-analytics-bar-fill--muted"
                  style={{
                    width: `${analytics.year.trackedDays ? (analytics.year.taken / analytics.year.trackedDays) * 100 : 0}%`,
                  }}
                />
              </div>
            </li>
            <li className="wellness-analytics-item">
              <div className="wellness-analytics-item-top">
                <span className="wellness-analytics-item-label">All time</span>
                <span className="wellness-analytics-item-value">
                  {analytics.allTime.taken} / {analytics.allTime.trackedDays}{" "}
                  days
                  {analytics.allTime.rate != null && (
                    <span className="wellness-analytics-pct">
                      {" "}
                      · {analytics.allTime.rate}%
                    </span>
                  )}
                </span>
              </div>
              <div
                className="wellness-analytics-bar"
                role="presentation"
                aria-hidden
              >
                <div
                  className="wellness-analytics-bar-fill wellness-analytics-bar-fill--lavender"
                  style={{
                    width: `${analytics.allTime.trackedDays ? (analytics.allTime.taken / analytics.allTime.trackedDays) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="wellness-analytics-item-caption">
                Since {formatHumanDate(makeLocalNoonDateFromISO(startDate))}
              </div>
            </li>
          </ul>
        </section>
      </main>

      {toast && (
        <div className="wellness-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
