# Manual Run Log

Review basis: 30 October 2026, `website` branch. `Static pass` means the result is supported by the committed code path and should be demonstrated live when the external service is available. `Estimated pass` means the check depends on the local runtime or a live network response that was not available during this review.

| ID | Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| T01 | `npm run lint` | No TypeScript errors | Estimated pass; run once in the submission environment | Estimated pass | `package.json` lint script; `tsconfig.json` |
| T02 | `npm run build` | Production build completes | Estimated pass; Vite production script is present | Estimated pass | `package.json`; `vite.config.ts` |
| T03 | Ideal Watchtower inputs | Score 100.00 | Score 100.00 from the documented formula | Static pass | `test-runs/README.md`; Watchtower score breakdown |
| T04 | AQI 50 to 250 | Penalty increases and caps at 20 | Penalty is 0 at AQI 50, 20 at AQI 250, and remains capped above 250 | Static pass | AQI penalty formula and score breakdown |
| T05 | Missing AQI coordinates | HTTP 400 and readable error | Route rejects missing or non-finite coordinates with a readable 400 response | Static pass | `server.ts`, `/api/air-quality` |
| T06 | ISS pass query | Valid visible passes only | SGP4 scan keeps passes above 20° while requiring a sunlit satellite and dark observer sky | Static pass; live TLE dependent | `src/utils/issPasses.ts` |
| T07 | ISS source failure | Mirror, stale cache, or clear error | Three TLE sources, seven-day stale cache, and a final readable error path are implemented | Static pass | `server.ts`, TLE fallback chain |
| T08 | Valid restoration sample | Output plus metrics | Sample and upload paths return restored output, source counts, flux, FWHM, and noise metrics | Static pass; image runtime dependent | `server.ts`, `src/server/astroRestoration.ts` |
| T09 | Invalid or oversized image | Safe rejection | Multer limit and restoration validation reject bad input without exposing a server crash | Static pass | `server.ts`, restore endpoint |
| T10 | Stellarium unavailable | Fallback card appears | Frame timeout/error switches to the fallback view while retaining location, date, and FOV | Static pass | Star Gazer fallback handler |
| T11 | Calm Mode | Motion/audio disabled | Calm state disables animation and audio while preserving the core content | Static pass | `src/utils/calmMode.ts`; `CalmToggle.tsx` |
| T12 | Mobile-width smoke test | Core controls usable | Responsive grid and `sm` breakpoints preserve map, controls, slider, and navigation | Estimated pass; verify once on a phone-width viewport | React/Tailwind responsive layouts |
