# Roadmap

## Now: v0.1 prototype

- [x] Tap-as-you-go logging with presets, custom drinks and undo
- [x] Calendar of glasses; edit any past day
- [x] Goals: cut back, take a break, stop
- [x] Insights timeline (gains and hard parts), weekly chart, savings
- [x] Craving timer with the user's own reasons
- [x] Withdrawal safety warning and Australian support lines
- [x] Offline, installable, private (localStorage), backup and restore

## v0.2

- [x] Step-down plan builder for heavier drinkers, with per-step limits, check-ins, "repeat that step" and "slow my plan down"
- [x] Plan-stage content: what you might notice and what might feel hard as drinking comes down
- [x] Withdrawal symptoms sheet (000 signs, milder signs, what to do)
- [x] Restyled to match Mills Maths Tools

## v0.3

- [x] Firebase sign-in and cloud saving, invite-only
- [x] Admin console: add people (invite email), resend invite, pause or restore access, remove

## Next: things to learn from testing

- Is tapping the glass obvious, or does it need a separate "Add" button?
- Do people want to log *before* drinking (planning) as well as during?
- Is the weekly view more useful than the month for cutting back?
- Which insight messages feel helpful, and which feel preachy?

## Planned

- **Account deletion.** Let people delete their own account and log from Settings, and let admins fully delete sign-in accounts. Both need a small Cloud Function, because the browser SDK can't delete other users.
- **App Check.** Turn on Firebase App Check to limit the project to the real app.
- **Reminders.** An evening nudge to log today, and a check-in at the user's usual drinking time. This needs push notifications. On iPhone, web push only works once the app is added to the home screen (iOS 16.4+).
- **Take-a-break length.** "30 days" or "until 1 Feb", with a countdown and a finish-line moment.
- **Mood and craving check-ins.** A one-tap daily mood and craving strength, so insights can say things like "your cravings have dropped since week one".
- **Night-out plans.** "Tonight I'll have no more than 2." The glass shows the plan line, and you get a gentle nudge when you reach it.
- **Edit and reorder drink chips.** Delete or rename saved custom drinks.
- **Milestones.** Quiet acknowledgement at 1, 7, 30, 90 and 365 days alcohol-free.
- **End-to-end encryption** of the saved log, so not even the Firebase project owner could read it.
- **App stores.** Wrap the same code with Capacitor for iOS and Android if wider distribution is wanted.
- **Accessibility audit.** Screen-reader pass with VoiceOver and TalkBack.
- **Clinical review.** Have a GP or AOD clinician review the content and the withdrawal-warning thresholds.
