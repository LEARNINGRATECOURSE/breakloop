# BreakLoop — Product Requirements Document

**Version:** 1.0  
**Status:** MVP  
**Last Updated:** October 2026

---

## One-Liner

Privacy-first break timer with visual break scheduling on an analog workday clock.

## Problem

Remote workers sit too long, forget breaks, and juggle separate tools. Existing solutions are either basic timers or invasive monitoring software.

## Solution

BreakLoop combines reliable break reminders with a visual **analog clock showing your break schedule**. No surveillance, no tracking—just you and your breaks.

---

## MVP Features

### 1. **Analog Break Clock** (Dashboard)
- Working hours window (e.g., 10 AM - 7 PM)
- All breaks visualized as **colored arcs** around clock
- **Dots** marking break start times with **numbered labels**
- Real-time time hand
- **Highlight** for upcoming/current break
- Responsive: mobile (200px), tablet, desktop (300px)

### 2. **Onboarding**
- Set working hours
- Configure break frequency
- Set break duration
- Toggle notifications & sound

### 3. **Schedule Management**
- Create/edit schedules per day of week
- Set start/end times
- Optional lunch break exclusion
- Auto-generate breaks

### 4. **Break Notifications**
- Native alerts at break time
- Sound + visual options
- Skip / Snooze / Complete actions

### 5. **Tasks** (Simple)
- Create, complete, delete tasks
- Optional priority & category
- Duration tracking

### 6. **Focus Timer** (Optional)
- Pomodoro-style sessions
- Pause / End controls
- Session summary

### 7. **Offline-First PWA**
- All core features work offline
- Service Worker caching
- IndexedDB storage
- Installable on iOS/Android

---

## Out of Scope (Phase 2+)

- ❌ User profiles / cloud sync
- ❌ AI prioritization
- ❌ Squad/social features
- ❌ Desktop apps
- ❌ Calendar integration

## Non-Goals

- ❌ Employee surveillance
- ❌ Keystroke logging or screenshots
- ❌ Webcam / hidden tracking
- ❌ Forced public leaderboards

---

## Key Metrics

| Metric | Target |
|--------|--------|
| Break Adherence Rate | > 60% by week 4 |
| D7 Retention | > 40% |
| D30 Retention | > 25% |
| Notification Disable Rate | < 10% |
| Tasks/User/Week | 5+ |

---

## Technical Stack

| Layer | Tech |
|-------|------|
| Framework | Vite + TypeScript |
| UI | HTML5 + SVG (clock) |
| Styling | CSS Variables + Modern CSS |
| Storage | IndexedDB (Dexie.js) |
| PWA | vite-plugin-pwa |
| Notifications | Service Worker + Web Notifications API |
| Audio | Web Audio API |

---

## Data Model

### Break
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

### BreakSchedule
```typescript
{
  id: string;
  dayOfWeek: number; // 0-6
  startTime: string; // "10:00"
  endTime: string; // "19:00"
  lunchStart?: string; // "12:00"
  lunchEnd?: string; // "13:00"
  breaks: Break[];
}
```

### Settings
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

## UX Flow

### First Time
1. User opens app
2. Onboarding: set working hours, break frequency, duration
3. Dashboard shows analog clock with breaks
4. User can complete, snooze, or skip breaks
5. Tasks area for optional task tracking

### Daily
1. Dashboard loads with today's break schedule on analog clock
2. Time hand updates in real-time
3. Notification 1 min before break
4. User clicks "Complete" or "Snooze"
5. Clock updates, next break highlights

---

## Acceptance Criteria

User can:
- [ ] Complete onboarding in < 2 minutes
- [ ] See all breaks for today on the analog clock at a glance
- [ ] Know exactly when the next break is
- [ ] Receive notification when break time arrives
- [ ] Skip, snooze, or complete a break with one tap
- [ ] Create and track a simple task list
- [ ] Use the app fully offline
- [ ] Use on any device (mobile/tablet/desktop)

---

## Privacy Policy (Built-In)

- ✅ No keystroke logging
- ✅ No screenshots
- ✅ No webcam access
- ✅ No hidden tracking
- ✅ All data stays local
- ✅ Export/delete data anytime
- ✅ No employee surveillance
- ✅ Anonymous usage

---

## Success Criteria (MVP)

1. **Analog clock** renders correctly at all sizes
2. **Breaks** appear at correct times on clock
3. **Notifications** fire at scheduled break times
4. **Offline** core functionality works without internet
5. **Responsive** design on mobile/tablet/desktop
6. **Accessible** to screen readers (WCAG AA)
7. **Fast** < 2s load time on 4G
8. **Installable** as PWA on iOS/Android

---

## Timeline

- **Week 1:** Project setup, analog clock
- **Week 2:** Schedule engine, dashboard, breaks visualization
- **Week 3:** Notifications, tasks, schedule editor
- **Week 4:** Focus timer, offline, PWA, responsive
- **Week 5:** Testing, accessibility, optimization, polish

---

**BreakLoop** — Work smarter. Rest on time. Level up with your squad.
