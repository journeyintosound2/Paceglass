# Roadmap

## Now: v0.1 prototype

- [x] Tap-as-you-go logging with presets, custom drinks and undo
- [x] Calendar of glasses; edit any past day
- [x] Goals: cut back, take a break, stop
- [x] Insights timeline (gains and hard parts), weekly chart, savings
- [x] Craving timer with the user's own reasons
- [x] Withdrawal safety warning and Australian support lines
- [x] Offline, installable, private (localStorage), backup and restore

## Next: things to learn from testing

- Is tapping the glass obvious, or does it need a separate "Add" button?
- Do people want to log *before* drinking (planning) as well as during?
- Is the weekly view more useful than the month for cutting back?
- Which insight messages feel helpful, and which feel preachy?

## Planned

- **Reminders.** An evening nudge to log today, and a check-in at the user's usual drinking time. This needs push notifications. On iPhone, web push only works once the app is added to the home screen (iOS 16.4+).
- **Take-a-break length.** "30 days" or "until 1 Feb", with a countdown and a finish-line moment.
- **Mood and craving check-ins.** A one-tap daily mood and craving strength, so insights can say things like "your cravings have dropped since week one".
- **Plans.** "Tonight I'll have no more than 2." The glass shows the plan line, and you get a gentle nudge when you reach it.
- **Edit and reorder drink chips.** Delete or rename saved custom drinks.
- **Milestones.** Quiet acknowledgement at 1, 7, 30, 90 and 365 days alcohol-free.
- **Sync across devices.** Optional and opt-in, and only if it can stay private, for example with end-to-end encryption.
- **App stores.** Wrap the same code with Capacitor for iOS and Android if wider distribution is wanted.
- **Accessibility audit.** Screen-reader pass with VoiceOver and TalkBack.
- **Clinical review.** Have a GP or AOD clinician review the content and the withdrawal-warning thresholds.
