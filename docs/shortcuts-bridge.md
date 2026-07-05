# Apple Shortcuts Export Bridge (Task 13)

This is the free export bridge: an Apple Shortcut that reads today's metrics from
Apple Health and POSTs them to the deployed ingestion endpoint, run automatically
twice a day.

## What it sends

The ingestion endpoint accepts this JSON (all metric fields optional except `date`;
the endpoint coerces stringified numbers, skips blank fields, and normalizes body fat
given as a percentage):

```json
{
  "entries": [
    {
      "date": "2026-07-05",
      "weightKg": 82.4,
      "bodyFat": 18.2,
      "steps": 8450,
      "nutrition": { "calories": 2180, "protein": 150, "carbs": 190, "fat": 70, "fiber": 30 }
    }
  ]
}
```

- Endpoint URL: `https://<PROJECT_REF>.supabase.co/functions/v1/ingest` (use your own project ref)
- Header: `x-api-key: <YOUR_INGEST_API_KEY>` (the raw key from `scripts/gen-ingest-key.mjs`)
- Header: `Content-Type: application/json`

Because ingestion is idempotent (keyed by date), running multiple times a day just
overwrites the day's row with the latest totals — safe by design.

## Build the Shortcut

Open the **Shortcuts** app → **+** to create a new shortcut. Add these actions in order.
(Action names vary slightly by iOS version; the intent is what matters.)

1. **Format Date**
   - Date: **Current Date**
   - Format: **Custom** → `yyyy-MM-dd`
   - This becomes the variable used as `date`. (Rename it to `Today`.)

2. **Weight** — *Find Health Samples*
   - Type: **Body Mass**, Unit: **kg**
   - Sort by **End Date**, Order **Latest First**, **Limit 1**
   - Then **Get Numbers from Input** (or "Get Details of Health Sample" → *Value*) → rename `Weight`.

3. **Body Fat** — *Find Health Samples*
   - Type: **Body Fat Percentage**, latest 1 (same pattern) → `BodyFat`.
   - (Send it however Health gives it — the endpoint accepts `0.18` or `18` and normalizes.)

4. **Steps** — *Find Health Samples*
   - Type: **Steps**, filter **Start Date** **is Today**
   - **Calculate Statistics** → **Sum** → `Steps`.

5. **Calories** — *Find Health Samples*
   - Type: **Dietary Energy**, Unit: **kcal**, **Start Date is Today** → **Calculate Statistics → Sum** → `Calories`.

6. Repeat step 5 for **Protein** (Dietary Protein, g), **Carbohydrates**, **Total Fat**,
   **Fiber** → `Protein`, `Carbs`, `Fat`, `Fiber`.

7. **Dictionary** (nutrition) — add keys:
   - `calories` = `Calories`, `protein` = `Protein`, `carbs` = `Carbs`, `fat` = `Fat`, `fiber` = `Fiber`
   - Rename this dictionary variable `Nutrition`.

8. **Dictionary** (entry) — add keys:
   - `date` = `Today`
   - `weightKg` = `Weight`
   - `bodyFat` = `BodyFat`
   - `steps` = `Steps`
   - `nutrition` = `Nutrition` (Type: Dictionary)
   - Rename `Entry`.

9. **List** — add one item: `Entry`. (Rename `Entries`.)

10. **Dictionary** (payload) — add one key:
    - `entries` = `Entries` (Type: Array/List)
    - Rename `Payload`.

11. **Get Contents of URL**
    - URL: `https://<PROJECT_REF>.supabase.co/functions/v1/ingest`
    - Method: **POST**
    - Headers: `Content-Type` = `application/json`, `x-api-key` = `<YOUR_INGEST_API_KEY>`
    - Request Body: **JSON**, value = `Payload`

12. *(Optional)* **Show Result** / **Quick Look** on the URL response to confirm
    `{"affected":[...]}` when you run it manually.

## Schedule it twice a day

Shortcuts app → **Automation** tab → **+** → **Create Personal Automation** →
**Time of Day**.

- Create one at roughly **13:00** and another at roughly **23:00** local time.
- Action: **Run Shortcut** → your shortcut.
- Turn **off "Ask Before Running"** (and "Notify When Run" if you prefer silent).

The late-evening run captures the full day (including calories logged during the day)
before the nightly server recompute at 21:30 UTC, so your morning dashboard is current.

## Verify

1. Run the shortcut manually once. The URL response should be
   `{"affected":["<today>"], "rejections":[], ...}`.
2. Open the webapp, sign in, and hit **Recompute now** — the dashboard should reflect
   today's real numbers.

## If Shortcuts proves flaky

Fully silent, unattended time-of-day automations can be inconsistent on iOS,
especially touching Health data. If it misses runs, the designated fallback (per the
free-first decision) is the **Health Auto Export** app's REST API automation, which
does the same POST more reliably for a small one-time cost. Switching bridges requires
**no server change** — the endpoint and payload contract are identical.
