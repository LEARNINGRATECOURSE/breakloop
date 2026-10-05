# BreakLoop — Project Documentation

**Project:** Privacy-first break timer with analog clock  
**Stack:** Vite + TypeScript + Vanilla JS  
**Status:** MVP in progress

---

## Project Overview

BreakLoop is a lightweight PWA designed to help remote and office workers structure their workday with timely, visual break reminders. The signature feature is an **analog clock showing breaks as colored arcs** on the dashboard.

**Core Promise:** Work smarter, rest better—without surveillance.

---

## Architecture

### Frontend Structure
```
src/
├── components/          # UI components
│   ├── analog-break-clock.ts  # SVG-based clock (core feature)
│   ├── dashboard.ts           # Main view
│   ├── task-manager.ts        # Task CRUD
│   └── focus-timer.ts         # Pomodoro modes
├── state/               # Types & interfaces
│   └── types.ts        
├── utils/              # Utilities & engines
│   ├── time-calculations.ts   # Time math
│   ├── schedule-engine.ts     # Break generation
│   ├── storage.ts             # IndexedDB (Dexie.js)
│   ├── service-worker.ts      # SW registration
│   └── notification-manager.ts
├── styles/             # CSS
│   └── main.css        # Global + component styles
├── app.ts              # Main app class
├── main.ts             # Entry point
└── service-worker.ts   # SW implementation
```

### Key Design Decisions

1. **SVG for Analog Clock:** Crisp rendering, scalable, accessible, fast
2. **IndexedDB for Storage:** Offline-first, no server needed, privacy-safe
3. **Vanilla JS:** No framework overhead, smaller bundle, faster load
4. **Service Worker:** Full offline support + PWA installation
5. **CSS Variables:** Dark/light theme switching, consistent design system

---

## Core Features

### 1. Analog Break Clock (Dashboard)
- **Visual:** SVG-rendered clock showing working hours window (e.g., 10 AM - 7 PM)
- **Breaks:** Colored arcs, dots, and numbered labels
- **Real-time:** Time hand updates every second
- **Highlight:** Upcoming/current break emphasized
- **Responsive:** 300px desktop, 200px mobile, scales smoothly

### 2. Break Scheduling
- Auto-generate breaks based on frequency (e.g., every 50 min)
- Configurable break duration (e.g., 5 min)
- Lunch break support (optional exclusion)
- Per-day schedules (Monday-Sunday)

### 3. Notifications
- Native Web Notifications API + Service Worker
- Sound (Web Audio API beep) + visual alert
- 1 minute before break
- Skip/Snooze/Complete actions

### 4. Task Management
- Simple CRUD (create, complete, delete)
- Priority levels (low, medium, high)
- Optional duration tracking
- IndexedDB persistence

### 5. Focus Timer
- 3 modes: Pomodoro (25m), Deep Work (50m), Flow State (90m)
- Real-time progress circle
- Pause/Resume/Stop controls
- Session summary

### 6. Offline & PWA
- Service Worker caching strategy
- IndexedDB for all data
- Installable on iOS/Android
- Works 100% offline

---

## State Management

Simple, lightweight approach:
- **App State:** Single source of truth in `app.ts`
- **Storage:** IndexedDB via Dexie.js
- **Updates:** Polling + event listeners (no Redux/Vuex needed)
- **Sync:** localStorage for UI preferences, IndexedDB for data

### Data Models

**Break**
```typescript
{
  id: string;
  name: string;
  startTime: "HH:mm";
  duration: number; // minutes
  type: "short" | "stretch" | "water" | "walk" | "eye-rest" | "meal" | "custom";
  color: string; // hex
  completed?: boolean;
  snoozedUntil?: number; // timestamp
}
```

**BreakSchedule**
```typescript
{
  id: string;
  dayOfWeek: number; // 0-6
  startTime: string; // "10:00"
  endTime: string; // "19:00"
  lunchStart?: string;
  lunchEnd?: string;
  breaks: Break[];
}
```

**Settings**
```typescript
{
  workingHoursStart: string;
  workingHoursEnd: string;
  breakFrequencyMinutes: number;
  breakDurationMinutes: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  darkMode: boolean;
  onboarded: boolean;
}
```

---

## Development Guidelines

### Adding a Feature

1. **Define types** in `src/state/types.ts`
2. **Create component** in `src/components/`
3. **Add utilities** in `src/utils/` if needed
4. **Update storage** in `src/utils/storage.ts`
5. **Add styles** to `src/styles/main.css`
6. **Integrate** into `app.ts`
7. **Test** offline + responsiveness

### Component Pattern

```typescript
export class MyComponent {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(data: any) {
    this.container.innerHTML = `/* template */`;
    this.attachEventListeners();
  }

  private attachEventListeners() {
    // Delegate events
  }

  public destroy() {
    // Cleanup
  }
}
```

### Styling

- Use CSS Variables (`--text-primary`, `--accent`, etc.)
- Mobile-first media queries
- No shadows unless necessary
- Accessible color contrast (4.5:1 minimum)
- Smooth transitions (0.2s default)

### Time Calculations

Use utilities in `src/utils/time-calculations.ts`:
- `timeStringToMinutes()` - "10:30" → 630
- `getCurrentTimeInMinutes()` - Current time as minutes
- `getMinutesSinceMidnight()` - For daily calculations
- `angleTo()` - Calculate angle on clock
- `arcAngle()` - Calculate arc width

### Storage

Use functions in `src/utils/storage.ts`:
```typescript
await db.schedules.put(schedule);
await db.tasks.update(id, updates);
const tasks = await db.tasks.toArray();
```

---

## Testing Checklist

### Analog Clock
- [ ] SVG renders without distortion
- [ ] Time hand updates smoothly (every second)
- [ ] Breaks appear at correct times
- [ ] Arcs properly sized for duration
- [ ] Highlight transitions smoothly
- [ ] Responsive on mobile/tablet
- [ ] No layout shift during updates

### Functional
- [ ] Onboarding flow works
- [ ] Breaks generate correctly
- [ ] Notifications fire at right time
- [ ] Skip/snooze/complete actions work
- [ ] Tasks persist after page reload
- [ ] Focus timer works all 3 modes
- [ ] Dark/light theme toggles

### Performance
- [ ] Load time < 2s on 4G
- [ ] Clock updates at 60fps
- [ ] No memory leaks
- [ ] Service Worker caches correctly

### Accessibility
- [ ] Screen reader reads clock
- [ ] Keyboard navigation works
- [ ] Color contrast > 4.5:1
- [ ] Focus visible on all interactive elements

### Offline
- [ ] All features work without internet
- [ ] Data syncs when back online
- [ ] Service Worker catches errors

---

## Deployment

### Build
```bash
npm run build
```

Outputs to `dist/` with:
- Minified JavaScript
- Optimized CSS
- PWA manifest
- Service Worker

### Deploy to Vercel/Cloudflare Pages

```bash
# Vercel
vercel

# Cloudflare Pages
npm run build
wrangler pages deploy dist
```

### Environment

No environment variables needed for MVP (fully offline).

---

## Known Limitations (MVP)

- ❌ No cloud sync (local only)
- ❌ No user authentication
- ❌ No multi-device sync
- ❌ iOS PWA notifications limited (fallback to Web Notifications)
- ❌ No AI prioritization
- ❌ No squad features

---

## Next Steps (Phase 2+)

1. User profiles + cloud sync (Supabase)
2. AI-powered prioritization
3. Squad/social accountability features
4. Calendar integration (Google Calendar, Outlook)
5. Desktop apps (Electron)
6. Advanced analytics

---

## Resources

- **Vite Docs:** https://vitejs.dev
- **TypeScript:** https://www.typescriptlang.org
- **Dexie.js:** https://dexie.org
- **PWA:** https://web.dev/progressive-web-apps
- **WCAG:** https://www.w3.org/WAI/WCAG21/quickref

---

## Contributing

1. Follow the component pattern above
2. Keep components small and focused
3. No tracking/surveillance features
4. Mobile-first responsive design
5. Accessible (WCAG AA minimum)
6. Test offline functionality

---

**BreakLoop** — Work smarter. Rest on time.
