# Tsukuyomi Watch Test Runs

This folder records the checks used to validate Problem Statement PS-002 before judging.

## Baseline

```bash
npm install
npm run lint
npm run build
npm run dev
```

Use Chandigarh coordinates for repeatable API checks: `lat=30.7333`, `lon=76.7794`, `alt=0`.

## Formula checks

```text
score = clamp(0, 100,
  100 - 0.6 * cloudCover
  - 0.25 * max(0, humidity - 45)
  - 0.5 * (24 - visibilityKm)
  - 2.5 * (bortleClass - 1)
  - min(20, 0.1 * max(0, aqi - 50)))
```

| Case | Inputs | Expected |
| --- | --- | --- |
| Ideal sky | Cloud 0%, humidity 45%, visibility 24 km, Bortle 1, AQI 50 | Score 100.00 |
| AQI starts penalizing | AQI 50 to AQI 51, other values ideal | Score decreases by 0.10 |
| AQI cap | AQI 250 and AQI 300, other values ideal | AQI penalty is capped at 20 |
| Low humidity | Humidity 45% or lower | Humidity penalty is 0 |
| Poor visibility | Visibility 0 km, other values ideal | Visibility penalty is 12 |
| Bright location | Bortle 9, other values ideal | Light-pollution penalty is 20 |
| Worst case | Cloud 100%, humidity 100%, visibility 0 km, Bortle 9, AQI 300 | Score clamps to 0 |
| Moderate case | Cloud 20%, humidity 60%, visibility 10 km, Bortle 4, AQI 100 | Score 64.75 |

## API and fallback checks

| Area | Test | Expected |
| --- | --- | --- |
| Air quality | `/api/air-quality?lat=30.7333&lon=76.7794` | HTTP 200 with numeric `us_aqi`, `pm2_5`, and `pm10` |
| Validation | Missing or non-numeric coordinates | Clear HTTP 400 response |
| Weather | `/api/weather?lat=30.7333&lon=76.7794` | Cloud, humidity, visibility, and forecast data |
| ISS | `/api/iss-passes?lat=30.7333&lon=76.7794&alt=0` | Every pass has rise < peak < set, positive duration, max elevation > 20° |
| ISS fallback | First TLE source unavailable | Mirror, stale cache, or clear error |
| Lunar data | `/api/moon-phase?lat=30.7333&lon=76.7794` | Phase, illumination, moonrise/set, and distance |
| Restoration | Valid small image | Restored image plus before/after metrics |
| Restoration edge case | Invalid or oversized image | Safe rejection without server crash |
| Stellarium | Embed blocked or delayed | Fallback preserves coordinates, date, and field of view |

## UI acceptance checks

- Watchtower shows weather, AQI, score breakdown, and a score between 0 and 100.
- Celestial Scroll shows lunar information and does not duplicate ISS passes after refresh.
- Star Gazer keeps the selected location and date when changing field of view.
- Spirit Lens handles a sample preset and a user image.
- Dojo before/after comparison and overlays work on a narrow screen.
- Calm Mode disables motion and audio without hiding core information.
- External API failure shows a fallback instead of a blank section.

## Judge evidence

During the demo, show one ideal-sky case, one high-AQI case, one ISS pass, one restoration comparison, and one deliberate fallback. State the input, formula or source, expected result, and observed result.
