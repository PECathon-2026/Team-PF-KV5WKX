# pecathonn2
# 🌙 Tsukuyomi Watch (月読の番) — The Samurai's Celestial Guide

> *"In feudal Japan, samurai and travelers read the heavens to time their battles, journeys, and rituals. Today, Tsukuyomi Watch clears the mist from the mountain, guiding the modern warrior through the cosmos."*

**Tsukuyomi Watch** is a samurai-themed celestial guide built for **PECathon 2026 (Problem Statement PS-002)**. It combines real-time stargazing spot discovery, cosmic event tracking, and faithful AI astrophotography restoration inside an immersive, ink-wash and moon-centric Japanese interface[cite: 1, 5, 6].

---

## ✨ Key Features & Problem Statement Alignment

### 1. 🏯 The Watchtower: Stargazing Location Finder (`WatchtowerSection.tsx` & `CelestialMapWidget.tsx`)
* **Real-Time Weather Telemetry:** Fetches live atmospheric conditions including cloud cover, relative humidity, and visibility from open meteorological APIs.
* **Night Honor Score:** Calculates a custom visibility rating ("Night Honor Score") combined with light pollution indicators to evaluate sky clarity at a glance[cite: 5].
* **Ancient Scroll Map:** Displays top nearby stargazing sanctuaries on an interactive map styled like an ancient Japanese scroll, featuring shrines, mountains, and temples as custom markers[cite: 1, 5].

### 2. 📜 The Celestial Scroll: Space Event Tracker (`CelestialScrollSection.tsx`)
* **Cosmic Event Curation:** Tracks meteor showers, solar/lunar eclipses, moon phases, real-time ISS passes (`issPasses.ts`), and upcoming rocket launches (`celestialEvents2026_2027.json`)[cite: 1, 5].
* **Traditional Lunar Calendar:** Filters astronomical phenomena by event type and date alongside traditional lunar cycle calculations (`lunarCycle.ts`)[cite: 1, 5].
* **Nightly Alerts & Lore:** Features celestial alerts (e.g., *"The Moon Rises Tonight at 8:14 PM"*) and daily Japanese astronomical folklore (`CelestialFactOfTheDay.tsx`, `celestialFactsAndFolklore.json`).

### 3. 🔮 The Spirit Lens: Faithful AI Image Restoration (`SpiritLensSection.tsx` & `astroRestoration.ts`)
* **True-to-Source Denoising & Deblurring:** Powered by the Server-Side Gemini API (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`), allowing users to upload raw, noisy deep-sky captures and clean up sensor noise and atmospheric blur without hallucinating fake cosmic structures.
* **Celestial Object Detection:** Automatically identifies stars, nebulae, and galaxies within the frame, reporting key metrics such as relative brightness (magnitude) and angular size[cite: 6].

### 4. ⚔️ The Dojo Dashboard: Visualization Interface (`DojoDashboardSection.tsx`)
* **Interactive Before/After Slider:** Compare raw deep-sky captures (`raw_deep_sky`) against restored nebulae (`restored_nebula`) with smooth split-screen scrubbing[cite: 1, 6].
* **Deep Zoom & Telemetry Overlays:** Inspect fine structural details with interactive pan/zoom controls and toggleable bounding-box overlays for detected celestial bodies[cite: 6].

### 5. 🏆 Bonus & Atmospheric Enhancements
* **Way of the Sky — Honor Points System (`HonorPointsSection.tsx`, `honorSystem.ts`):** Gamifies stargazing by awarding Honor Points and samurai ranks for logging observations, completing celestial quests, and restoring astrophotography[cite: 1, 6].
* **Zen & Sensory Immersion (`CalmToggle.tsx`, `soundEngine.ts`, `FallingLeaves.tsx`):** Includes a procedural Web Audio soundscape engine, Calm Mode toggle, dynamic moon phase header widget (`DynamicMoonPhase.tsx`), and animated cherry blossom/autumn leaf particle effects[cite: 1, 6].

---

## 🎨 Theme & Aesthetic Architecture

Designed around traditional Japanese *Sumi-e* (ink-wash) aesthetics and nocturnal minimalism[cite: 6]:
* **Palette:** Deep obsidian night blacks, crimson torii reds, and gilded brass/gold accents[cite: 6].
* **Motifs:** Torii gates, katana dividers, lantern-lit pavilions, and dynamic lunar phase iconography[cite: 1, 6].

---

## 🗂️ Project Structure

```text
tsukuyomi-watch/
├── metadata.json                            # App capabilities & geolocation permissions
├── public/
│   └── assets/images/                       # Sample nebula & reference imagery
│       ├── carina_nebula.jpg
│       └── restored_nebula.jpg
└── src/
    ├── App.tsx                              # Root application & routing
    ├── main.tsx                             # Application entry point
    ├── index.css                            # Ink-wash & crimson/gold theme styles
    ├── assets/images/                       # Scenic samurai & astrophotography assets
    ├── components/
    │   ├── WatchtowerSection.tsx            # 1. Stargazing Spot Finder & Weather
    │   ├── CelestialMapWidget.tsx           # Interactive scroll-styled map
    │   ├── CelestialScrollSection.tsx       # 2. Space Event Tracker & Lunar Calendar
    │   ├── SpiritLensSection.tsx            # 3. AI Astrophotography Restoration UI
    │   ├── DojoDashboardSection.tsx         # 4. Before/After Slider & Object Overlays
    │   ├── HonorPointsSection.tsx           # Bonus: Gamified Honor Points & Ranks
    │   ├── StarField.tsx                    # Animated night sky background
    │   ├── FallingLeaves.tsx                # Ambient Japanese particle effects
    │   ├── Navbar.tsx & Footer.tsx          # Navigation & layout shell
    │   └── common/
    │       ├── DynamicMoonPhase.tsx         # Live lunar phase indicator
    │       ├── CelestialFactOfTheDay.tsx    # Daily space & samurai lore banner
    │       └── CalmToggle.tsx               # Ambient audio & Zen mode controller
    ├── data/
    │   ├── celestialEvents2026_2027.json    # Curated 2026–2027 space events dataset
    │   └── celestialFactsAndFolklore.json   # Japanese star lore & astronomical facts
    ├── server/
    │   └── astroRestoration.ts              # Server-side Gemini API restoration & detection
    └── utils/
        ├── dataClient.ts                    # Weather & external API client
        ├── issPasses.ts                     # ISS pass prediction calculator
        ├── lunarCycle.ts                    # Traditional lunar phase & illumination math
        ├── honorSystem.ts                   # Honor Points & progression persistence
        ├── imageStore.ts                    # Client-side image state management
        ├── calmMode.ts                      # Zen mode state manager
        └── soundEngine.ts                   # Ambient sound effects & audio synthesizer
