# Door 4 Officer Android App (MVP)

Android app for Door 4 ground officers to always see assigned gates.

## What it does
- Shows `My Gates` list for one staff ID.
- Auto-refreshes every 20 seconds.
- Manual refresh button.

## Configure
Edit `app/build.gradle.kts`:
- `API_BASE_URL` (for emulator use `http://10.0.2.2:8000/`)
- `API_TOKEN`
- `STAFF_ID`

## Expected API
The app calls:
- `GET /api/v1/deployments/door-4/officer/my-gates?date=YYYY-MM-DD&staff_id=...`

Expected response shape:
```json
{
  "officerName": "charles",
  "staffId": "100554",
  "generatedAt": "2026-05-04T14:10:00+08:00",
  "assignments": [
    {
      "flightNo": "TR227",
      "gate": "D40L",
      "terminal": "1",
      "eta": "14:45",
      "sch": "15:05",
      "status": "Confirmed",
      "assignmentStatus": "Prepare"
    }
  ]
}
```

## Notes
- If this endpoint is not available yet, backend needs to add it.
- Current UI is MVP and optimized for readability on ground operations.
