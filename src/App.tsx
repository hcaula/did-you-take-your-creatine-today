import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildHistoryKeysInclusive,
  clearStorage,
  coerceSave,
  computeBestStreak,
  computeCurrentStreak,
  ensureStartDate,
  formatHumanDate,
  getTodayKey,
  makeDefaultSave,
  makeLocalNoonDateFromISO,
  saveToStorage,
  type ISODate,
  type SaveDataV1,
} from './lib/creatine'

function App() {
  const [save, setSave] = useState<SaveDataV1>(() => {
    // Lazily load to avoid blocking initial paint more than needed.
    return (() => {
      try {
        const raw = localStorage.getItem('creatine-tracker:v1')
        if (!raw) return makeDefaultSave()
        const parsed: unknown = JSON.parse(raw)
        return coerceSave(parsed) ?? makeDefaultSave()
      } catch {
        return makeDefaultSave()
      }
    })()
  })

  const [toast, setToast] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const today = getTodayKey()
  const todayTaken = !!save.taken[today]

  useEffect(() => {
    saveToStorage(save)
  }, [save])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  const startDate = save.startDate ?? today

  const historyKeys = useMemo(() => {
    return buildHistoryKeysInclusive(startDate, today)
  }, [startDate, today])

  const currentStreak = useMemo(() => computeCurrentStreak(save, today), [save, today])
  const bestStreak = useMemo(() => computeBestStreak(save, startDate, today), [save, startDate, today])

  const statusIcon = todayTaken ? (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="statusIcon ok">
      <path
        fill="currentColor"
        d="M9.0 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
      />
    </svg>
  ) : (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="statusIcon no">
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.7 13.3-1.4 1.4L12 13.4l-3.3 3.3-1.4-1.4L10.6 12 7.3 8.7l1.4-1.4L12 10.6l3.3-3.3 1.4 1.4L13.4 12l3.3 3.3z"
      />
    </svg>
  )

  function updateDate(key: ISODate, nextTaken: boolean) {
    setSave((prev) => {
      const next: SaveDataV1 = {
        ...prev,
        taken: { ...prev.taken, [key]: nextTaken },
        updatedAt: Date.now(),
      }
      return nextTaken ? ensureStartDate(next, key) : next
    })
  }

  function toggleToday() {
    updateDate(today, !todayTaken)
  }

  function exportData() {
    const payload = JSON.stringify(save, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `creatine-tracker-${today}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setToast('Exported JSON')
  }

  async function importFromFile(file: File) {
    setImportError(null)
    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)
      const coerced = coerceSave(parsed)
      if (!coerced) {
        setImportError('Invalid save file (expected version 1).')
        return
      }
      setSave(coerced)
      setToast('Imported save data')
    } catch {
      setImportError('Could not read that file as JSON.')
    }
  }

  function onPickImport() {
    importInputRef.current?.click()
  }

  function onClear() {
    if (!confirm('Clear all local data? This cannot be undone.')) return
    clearStorage()
    setSave(makeDefaultSave())
    setToast('Cleared data')
  }

  const subtitleDate = formatHumanDate(new Date())

  const currentRange =
    currentStreak.length > 0 && currentStreak.start && currentStreak.end
      ? `${formatHumanDate(makeLocalNoonDateFromISO(currentStreak.start))} - ${formatHumanDate(
          makeLocalNoonDateFromISO(currentStreak.end),
        )}`
      : '—'

  const bestRange =
    bestStreak.length > 0 && bestStreak.start && bestStreak.end
      ? `${formatHumanDate(makeLocalNoonDateFromISO(bestStreak.start))} - ${formatHumanDate(
          makeLocalNoonDateFromISO(bestStreak.end),
        )}`
      : '—'

  return (
    <div className="page">
      <header className="hero">
        <div className="brandRow">
          <img className="brandIcon" src="/creatine.svg" alt="" aria-hidden="true" />
          <div className="brandText">
            <h1 className="title">Did You Take Your Creatine Today?</h1>
            <p className="subtitle">
              {subtitleDate} · Local-only storage · Export/Import supported
            </p>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="topGrid" aria-label="Today">
          <div className="card statusCard">
            <div className="statusTop">
              <div className="statusPill" data-state={todayTaken ? 'yes' : 'no'}>
                {statusIcon}
                <span className="statusText">{todayTaken ? 'Yes' : 'No'}</span>
              </div>
              <div className="statusMeta">
                <div className="metaLabel">Today</div>
                <div className="metaValue">{subtitleDate}</div>
              </div>
            </div>

            <button
              className={todayTaken ? 'primary danger' : 'primary'}
              onClick={toggleToday}
              aria-pressed={todayTaken}
            >
              {todayTaken ? 'Uncheck today' : 'Check today'}
            </button>

            <p className="hint">
              Tip: you can also edit any day below to correct missed entries.
            </p>
          </div>

          <div className="card streakCard" aria-label="Streaks">
            <div className="streakGrid">
              <div className="streakBox">
                <div className="streakLabel">Current streak</div>
                <div className="streakValue">{currentStreak.length} days</div>
                <div className="streakRange">{currentRange}</div>
              </div>
              <div className="streakBox">
                <div className="streakLabel">Best streak</div>
                <div className="streakValue">{bestStreak.length} days</div>
                <div className="streakRange">{bestRange}</div>
              </div>
            </div>

            <div className="actionsRow">
              <button className="secondary" onClick={exportData}>
                Export
              </button>
              <button className="secondary" onClick={onPickImport}>
                Import
              </button>
              <button className="secondary subtle" onClick={onClear}>
                Clear
              </button>
              <input
                ref={importInputRef}
                className="srOnly"
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.currentTarget.value = ''
                  if (file) void importFromFile(file)
                }}
              />
            </div>

            {importError ? <div className="inlineError">Import error: {importError}</div> : null}
          </div>
        </section>

        <section className="card historyCard" aria-label="History">
          <div className="historyHeader">
            <h2 className="h2">History</h2>
            <div className="historyNote">
              From your first tracked day to today · Most recent first
            </div>
          </div>

          <ul className="historyList">
            {historyKeys.map((key) => {
              const d = makeLocalNoonDateFromISO(key)
              const label = formatHumanDate(d)
              const checked = !!save.taken[key]
              return (
                <li key={key} className="historyRow">
                  <div className="historyLeft">
                    <div className="historyDate">{label}</div>
                    <div className="historyKey">{key}</div>
                  </div>
                  <button
                    className={checked ? 'toggle on' : 'toggle'}
                    onClick={() => updateDate(key, !checked)}
                    aria-pressed={checked}
                    aria-label={checked ? `Mark ${label} as not taken` : `Mark ${label} as taken`}
                  >
                    <span className="toggleDot" aria-hidden="true" />
                    <span className="toggleText">{checked ? 'Taken' : 'Not taken'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <footer className="footer">
          <div className="footerInner">
            <span>Data stays on your device.</span>
            <span className="footerSep">·</span>
            <span>Pro tip: “Add to Home Screen” for an app-like experience.</span>
          </div>
        </footer>
      </main>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  )
}

export default App
