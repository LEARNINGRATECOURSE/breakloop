# BreakLoop

Work smarter, rest better. Privacy-first break timer with analog clock.

## Features

- 🕐 **Analog Break Clock** - Visual break schedule with working hours window
- 🔔 **Smart Notifications** - Sound/visual alerts for breaks
- 📋 **Task Management** - Simple task tracking
- 🎯 **Focus Timer** - Optional Pomodoro-style sessions
- 📱 **Responsive PWA** - Works on mobile/tablet/desktop
- 🔒 **Privacy First** - No tracking, offline-first, local storage only
- ⚡ **Lightweight** - No surveillance, no bloat

## Project Structure

```
src/
├── components/          # UI components
│   ├── analog-break-clock.ts  # Main clock visualization
│   └── dashboard.ts           # Main dashboard
├── state/               # State management
│   └── types.ts        # TypeScript interfaces
├── utils/              # Utilities
│   ├── time-calculations.ts
│   ├── schedule-engine.ts
│   ├── storage.ts      # IndexedDB
│   └── service-worker.ts
├── styles/             # CSS
│   └── main.css
├── app.ts              # Main app class
├── main.ts             # Entry point
└── service-worker.ts   # Service worker
```

## Quick Start

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Build

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

## Architecture

### Analog Break Clock

The analog clock is SVG-based and shows:
- Working hours window (configurable, e.g., 10 AM - 7 PM)
- Break arcs colored by break type
- Break dots and numbered labels
- Current time hand (real-time)
- Highlight for upcoming/current break

### State Management

Simple client-side state with:
- **IndexedDB** via Dexie.js for persistent storage
- **Service Worker** for offline functionality
- **CSS Variables** for theming

### Break Generation

Breaks are generated based on:
- Working hours (start/end time)
- Break frequency (e.g., every 50 minutes)
- Break duration (e.g., 5 minutes)
- Lunch break exclusion (optional)

## Configuration

### Onboarding

Users configure:
1. Working hours (start/end time)
2. Break frequency (minutes)
3. Break duration (minutes)
4. Notification preferences
5. Sound preferences

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS 14+, Android 12+)

## Privacy

- ✅ No tracking
- ✅ No keystroke logging
- ✅ No screenshots
- ✅ No webcam access
- ✅ All data stays local
- ✅ Export/delete data anytime

## Roadmap

### Phase 1 (MVP)
- [x] Basic project setup
- [ ] Analog break clock
- [ ] Onboarding flow
- [ ] Break notifications
- [ ] Task management
- [ ] Offline functionality
- [ ] Responsive design

### Phase 2
- [ ] Cloud sync
- [ ] User profiles
- [ ] AI prioritization
- [ ] Advanced analytics

### Phase 3
- [ ] Squad/social features
- [ ] Calendar integration
- [ ] Desktop apps

## Contributing

Contributions welcome! Please ensure:
- Type-safe TypeScript
- No tracking/surveillance features
- Mobile-first responsive design
- Accessibility (WCAG AA)

## License

MIT

---

**BreakLoop** - Work smarter. Rest on time. Level up with your squad.
