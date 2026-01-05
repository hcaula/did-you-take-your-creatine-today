# Did You Take Your Creatine Today?

A tiny single-page webapp for tracking your daily creatine dosage.

- **Single tap** to check/uncheck today
- **History list** of days from your first tracked day to today (toggle any date)
- **Current + best streak** (with date ranges)
- **Optional taken time**: when you check _today_, we store the current time
- **Month filter**: view a specific month/year or **All**
- **Local-only** storage + **Export/Import** JSON backups

## Getting started

This is a Vite + React + TypeScript project (uses `pnpm`).

```bash
pnpm install
pnpm dev
```

Build/preview:

```bash
pnpm build
pnpm preview
```

Lint:

```bash
pnpm lint
```

## How it works

### Data model (local-only)

Your data is stored in **localStorage** under the key `creatine-tracker:v1`.

- A day is identified by **local calendar date** `YYYY-MM-DD`
- A day is considered **taken** if it exists in the `taken` map
- `taken[date]` is either:
  - a **number** (`Date.now()` timestamp) if you checked **today** (so we can show “Taken at …”)
  - **null** if the day was marked historically (no time information)

Old saves (boolean-based) are automatically migrated on load.

### Streak rules

- **Current streak**: the most recent consecutive run up to today. If you haven’t checked today yet, the streak can still end **yesterday** (so you don’t “lose” a streak during the day).
- **Best streak**: longest consecutive run found between your first tracked day and today.

## Using the app

### Backfilling older days

At the bottom of History, click **Set initial date** to expand your timeline earlier (e.g. if you started taking creatine before you began tracking). This only sets the earliest day shown; it does not create entries.

### Export / Import

- **Export** downloads a JSON file of your current data.
- **Import** replaces your local data with the JSON you select.

Tip: this makes it easy to move data between devices.

## PWA + SEO notes

- Includes `public/manifest.webmanifest` and an app icon (`public/creatine.svg`)
- Registers a minimal service worker (`public/sw.js`) for basic offline support
- `index.html` includes a description and Open Graph tags for nicer previews

## Project structure

- `src/App.tsx`: UI + app behavior
- `src/lib/creatine.ts`: date utilities, storage coercion/migration, streak logic
- `public/manifest.webmanifest`, `public/sw.js`: PWA basics
