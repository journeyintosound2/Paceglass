# Paceglass

A private drink tracker for people who want to cut back or take a break from alcohol.

Every day on the calendar is a glass. Log drinks as you go and it fills up. An alcohol-free day stays clear. Along the way, Paceglass tells you what you might be gaining and what might feel hard at that stage, so the rough patches make sense when they arrive.

> **Status:** prototype (v0.4.0). It's built for testing on a phone, not yet for public release.

## What it does

- **Tap as you go.** Pick what you're drinking, then tap the big glass each time you have one. There's an undo straight after, and a pace note ("Last drink 25 min ago").
- **Calendar.** Each day shows how full its glass was. Tap any past day to fill it in, add drinks, change the total or mark it alcohol-free.
- **Australian standard drinks.** A standard drink is 10 g of alcohol. There are presets for schooners, middies, cans, wine, sparkling, spirits and premixes, and you can add your own from the size and ABV on the label.
- **My drinks.** Tap the pencil to edit the list: × removes a drink (with undo), **+** adds one, tapping a drink changes it, and holding and dragging reorders the list. There are also **Move earlier/later** buttons in each drink's edit screen. Each drink has an icon: beer, red wine, white wine, spirit or can.
- **Step-down plans.** For someone drinking heavily, Paceglass builds a week-by-week taper from where they are now (say 70 a week) to where they want to be (10 a week, or alcohol-free). Each step has its own weekly and daily limit. Alcohol-free days only start once a step is down to about 4 a day. At the start of each step there's a check-in: if the last step went over, the user can repeat it. An "I'm getting withdrawal symptoms" button shows the signs that need 000 and can slow the plan down (back up to the last comfortable level for a week, then about 10% a week).
- **Three goals:**
  - **Cut back:** weekly and daily limits, defaulting to the NHMRC guideline of 10 a week and 4 a day.
  - **Take a break:** a set period alcohol-free.
  - **Stop drinking.**
- **Insights.** A timeline of your current alcohol-free stretch, from the first day to three months and beyond, with "what you might notice" and "what might feel hard" for each stage. It also shows week-by-week totals, drinks avoided compared with before, money not spent and kilojoules not consumed.
- **Craving timer.** Ride out an urge for 15 minutes, with practical tips and your own reasons shown back to you.
- **Safety first.** People who drank heavily before stopping see a clear warning about alcohol withdrawal, plus Australian support lines.
- **Personal codes (optional).** With Firebase set up, people sign in with a personal code (like `K7QM-3XRP`) that an admin creates for them, and their log is saved to the cloud so it's backed up and works across devices. The security rules let only that person read their log. Anyone can also **continue without signing in**, which keeps everything on that device only.
- **Admin console.** `admin.html`, linked as **Admin console** in the app. Admins sign in with email and password to create people and their codes, issue new codes, and pause or remove access.

## Try it on your computer

You need any static web server; opening `index.html` directly from the file system won't work, because the app uses JavaScript modules.

```bash
# Option 1: Node
npx serve .

# Option 2: Python
python3 -m http.server 8080
```

Then open http://localhost:8080 (or the port shown).

## Put it on GitHub and test it on your phone

1. In GitHub Desktop, choose **File → Add local repository** and pick this folder. When it says it isn't a repository yet, click **create a repository**.
2. Commit everything, then click **Publish repository**. It can be public or private. GitHub Pages on a private repo needs a paid plan.
3. On github.com, open the repository and go to **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, then pick `main` and `/ (root)` and save.
4. After a minute or so the site is live at `https://<your-username>.github.io/Paceglass/`.
5. Open that link on your phone:
   - **iPhone (Safari):** tap **Share → Add to Home Screen**.
   - **Android (Chrome):** tap **⋮ → Install app** or **Add to Home screen**.

   It then opens full-screen like an app and works offline after the first visit.

Each person's data stays on their own phone until Firebase is set up; then it's saved to their own account. Testers never see each other's logs.

## Accounts and the admin console (Firebase)

Follow [`docs/FIREBASE-SETUP.md`](docs/FIREBASE-SETUP.md) to create the Firebase project, paste its settings into `js/firebase-config.js`, publish `firestore.rules` and make your account an admin. No passwords or admin emails are stored in this repository.

How it works:

1. In the admin console, you add someone by name. Paceglass makes them an 8-character code from an alphabet with no look-alike characters (no 0/O or 1/I/L).
2. Behind the scenes, the code signs in to a hidden Firebase Authentication account. Firebase does the checking and rate-limits guessing.
3. The person taps **Sign in** in the app and enters the code. Their log saves to `userData/{their id}`, keyed by person rather than by code, so issuing a new code doesn't lose anything.
4. You can issue a new code, pause access or remove someone at any time.

## Project layout

```
index.html              App shell: the four screens, tab bar and sheets
css/styles.css          All styles, with light and dark themes
js/app.js               Rendering and interactions for the app, plus sign-in and cloud saving
admin.html              Admin console page
js/admin.js             Admin console: sign in, create people and codes, new code, pause, remove
js/codes.js             Personal codes: generate, tidy what people type, map to the hidden sign-in account
css/admin.css           Admin console layout (builds on styles.css)
js/cloud.js             Firebase sign-in and Firestore saving (SDK loaded from Google's CDN)
js/firebase-config.js   Your Firebase project's web settings (empty = local-only mode)
firestore.rules         Security rules to paste into the Firebase console
js/store.js             Data model, saving to localStorage, backup import/export
js/stats.js             Weekly totals, streaks, drinks avoided, savings
js/insights.js          Timeline and plan-stage content, messages, safety text, support lines
js/plan.js              Step-down plan maths: build, current step, repeat a step, slow down
js/limits.js            Which limits apply on a given day (plan step or Settings)
js/drinks.js            Standard drink formula, Australian presets, My drinks helpers
js/drink-icons.js       The five drink icons
js/dates.js             Local-date helpers (days are stored as YYYY-MM-DD)
js/glass.js             The glass drawing used across the app
sw.js                   Service worker for offline use
manifest.webmanifest    Install details (name, icons, colours)
icons/                  App icons
tests/                  Unit tests for the logic modules
docs/                   Roadmap and content sources
```

The logic modules (`store`, `stats`, `insights`, `drinks`, `dates`) are plain functions with no page access, so they can be tested in Node and reused later if the app moves to React Native or gets wrapped for the app stores.

## Running the tests

```bash
npm test
```

This needs Node 20 or later. GitHub Actions runs the tests on every push (`.github/workflows/test.yml`).

## How the data is stored

Everything is saved under one key, `paceglass:v1`, in the browser's localStorage:

```json
{
  "version": 1,
  "settings": { "goalMode": "cutback", "weeklyLimit": 10, "dailyLimit": 4, "...": "..." },
  "days": {
    "2026-10-12": {
      "entries": [{ "id": "…", "t": "2026-10-12T08:47:00.000Z", "label": "Schooner", "std": 1.6 }],
      "manual": 0,
      "note": "",
      "logged": true
    }
  }
}
```

A day's total is its entries plus `manual`, which is any amount added or taken away by hand in the calendar. A day that exists with a total of 0 is an alcohol-free day. A day with no record is "not filled in", which is a different thing.

In local-only mode, clearing browser data deletes the log; that's why Settings has **Save a backup**.

When signed in, the same state is stored per person under `paceglass:v1:{memberId}` on the device and in Firestore at `userData/{memberId}` as a JSON string. A log kept without signing in moves into the account the first time that person signs in on the device. Each copy carries a `savedAt` time, and when the two differ, the most recently saved copy wins. Changes save to the cloud about a second after each edit, and are queued while offline. Signing out removes the copy from the device.

## Look and feel

The interface follows the Mills Maths Tools style (millsmathstools.au): the Inter typeface, a navy-to-blue gradient app bar, a pale blue-grey page with soft colour glows, white rounded cards and bold pill buttons. The colour tokens at the top of `css/styles.css` use the same names and values as that site, plus a dark theme built from the same navy.

## Content and wording

The health information is general and written for adults. Each claim is listed with its source in [`docs/CONTENT-SOURCES.md`](docs/CONTENT-SOURCES.md). Wording guidelines:

- Say "you might notice", never "you will".
- No shame and no red. Going over a limit turns the glass heather, not red, and a slip is described as part of the process.
- Always keep a route to real help: GP, the hotline, and 000 in an emergency.

## Disclaimer

Paceglass offers general information, not medical advice. The pace note is not a blood alcohol estimate and must never be used to decide whether someone can drive. Anyone who drinks heavily every day should talk to a GP before stopping, because alcohol withdrawal can be dangerous.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's planned next.
