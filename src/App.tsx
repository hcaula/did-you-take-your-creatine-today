import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildHistoryKeysInclusive,
  clearStorage,
  coerceSave,
  compareISODate,
  computeBestStreak,
  computeCurrentStreak,
  ensureStartDate,
  formatHumanDate,
  formatHumanTime,
  getTodayKey,
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    }
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSettings]);

  const todayTaken = isTaken(save, today);
  const todayTakenAt = todayTaken ? save.taken[today] : undefined;

  const currentMonthKey = `${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1,
  ).padStart(2, "0")}`;
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthKey);

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

  const historyKeys = useMemo(() => {
    return buildHistoryKeysInclusive(startDate, today);
  }, [startDate, today]);

  const monthOptions = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    });
    const startD = makeLocalNoonDateFromISO(startDate);
    const endD = makeLocalNoonDateFromISO(today);
    const startMonth = new Date(startD.getFullYear(), startD.getMonth(), 1, 12);
    const endMonth = new Date(endD.getFullYear(), endD.getMonth(), 1, 12);

    const opts: Array<{ value: string; label: string }> = [
      { value: "all", label: "All" },
    ];

    const cursor = new Date(endMonth);
    while (cursor >= startMonth) {
      const value = `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1,
      ).padStart(2, "0")}`;
      opts.push({ value, label: fmt.format(cursor) });
      cursor.setMonth(cursor.getMonth() - 1, 1);
    }
    return opts;
  }, [startDate, today]);

  useEffect(() => {
    if (monthFilter === "all") return;
    if (monthOptions.some((o) => o.value === monthFilter)) return;
    setMonthFilter(currentMonthKey);
  }, [monthFilter, monthOptions, currentMonthKey]);

  const filteredHistoryKeys = useMemo(() => {
    if (monthFilter === "all") return historyKeys;
    return historyKeys.filter((k) => k.slice(0, 7) === monthFilter);
  }, [historyKeys, monthFilter]);

  const currentStreak = useMemo(
    () => computeCurrentStreak(save, today),
    [save, today],
  );
  const bestStreak = useMemo(
    () => computeBestStreak(save, startDate, today),
    [save, startDate, today],
  );

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
    setShowSettings(false);
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
      setShowSettings(false);
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
    setShowSettings(false);
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
              onClick={() => setShowSettings(!showSettings)}
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
          <div className="wellness-history-header">
            <h2 className="wellness-h2">Recent Activity</h2>
            <select
              className="wellness-select"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label="Filter by month"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="wellness-history-list">
            {filteredHistoryKeys.map((key) => {
              const d = makeLocalNoonDateFromISO(key);
              const label = formatHumanDate(d);
              const checked = isTaken(save, key);
              const takenAt = checked ? save.taken[key] : undefined;
              return (
                <div key={key} className="wellness-history-row">
                  <div className="wellness-history-left">
                    <div
                      className={`wellness-history-dot ${checked ? "done" : ""}`}
                    />
                    <div className="wellness-history-info">
                      <div className="wellness-history-date">{label}</div>
                      {typeof takenAt === "number" && (
                        <div className="wellness-history-time">
                          {formatHumanTime(new Date(takenAt))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className={`wellness-history-toggle ${checked ? "done" : ""}`}
                    onClick={() => updateDate(key, !checked)}
                    aria-pressed={checked}
                    aria-label={
                      checked
                        ? `Mark ${label} as not taken`
                        : `Mark ${label} as taken`
                    }
                  >
                    {checked ? "Taken" : "Missed"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="wellness-history-footer">
            <button
              className="wellness-link-btn"
              onClick={() => {
                setStartDateError(null);
                setShowInitialDate(!showInitialDate);
              }}
              aria-expanded={showInitialDate}
            >
              {showInitialDate ? "Hide" : "Change start date"}
            </button>

            {showInitialDate && (
              <div className="wellness-start-date-panel">
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
                <button className="wellness-btn-sm" onClick={applyStartDate}>
                  Apply
                </button>
                {startDateError && (
                  <div className="wellness-inline-error">{startDateError}</div>
                )}
              </div>
            )}
          </div>
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
