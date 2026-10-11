# Content sources

Every health statement in `js/insights.js` and on the Settings screen should trace back to a source here. Re-check these before any public release, because guidelines get updated.

| Claim in the app | Source |
|---|---|
| An Australian standard drink is 10 g of alcohol; standard drinks = volume (L) × ABV (%) × 0.789 | Australian Government Department of Health, *Standard drinks guide* — health.gov.au |
| No more than 10 standard drinks a week and no more than 4 on any one day | NHMRC, *Australian guidelines to reduce health risks from drinking alcohol* (2020) — nhmrc.gov.au |
| The body clears roughly one standard drink an hour | Australian Government Department of Health / Alcohol and Drug Foundation (adf.org.au), general guidance. Shown with a "not a driving guide" warning. |
| Withdrawal symptoms (shaking, sweating, racing heart, anxiety, confusion, hallucinations), typically 6–72 hours after the last drink; seek medical help; heavy daily drinkers should see a GP before stopping | Alcohol and Drug Foundation, *Alcohol withdrawal*; healthdirect Australia, *Alcohol withdrawal* |
| Alcohol suppresses REM sleep; vivid dreams as REM rebounds after stopping | Sleep Health Foundation (sleephealthfoundation.org.au), *Alcohol and sleep*; general sleep-medicine literature on REM rebound |
| A month off alcohol improved insulin resistance, blood pressure and weight on average in moderate-to-heavy drinkers | Mehta G et al. (2018). *Short-term abstinence from alcohol and changes in cardiovascular risk factors, liver function tests and cancer-related growth factors: a prospective observational study.* BMJ Open 8:e020673 — https://bmjopen.bmj.com/content/8/5/e020673 |
| Liver fat can start to reduce within weeks; early fatty liver can reverse with abstinence | Mehta 2018 (above); Australian Liver Foundation / healthdirect, *Alcohol-related liver disease* |
| Alcohol is linked to at least seven types of cancer; risk falls over time after stopping | Cancer Council Australia, *Alcohol and cancer* — cancer.org.au; IARC Group 1 classification |
| Cutting down at home: reduce by about 10% every four days; if withdrawal symptoms appear, go back up to a level without symptoms, hold for a week, then cut by about 10% a week; get professional help first if you've had seizures or hallucinations when stopping; call an ambulance for a seizure, confusion, hallucinations, double vision or being unsteady | University Hospitals Sussex NHS Trust, *How to reduce alcohol intake* (2023) — https://www.uhsussex.nhs.uk/wp-content/uploads/2023/09/How-to-reduce-alcohol-intake.pdf. Used for the plan paces (Steady ≈ 10% every four days ≈ 17% a week; Gentle = 10% a week), "Slow my plan down", and the symptoms sheet. |
| Blood pressure comes down as heavy drinking comes down | Roerecke M et al. (2017). *The effect of a reduction in alcohol consumption on blood pressure: a systematic review and meta-analysis.* Lancet Public Health 2:e108–e120 |
| At 10 or fewer a week and no more than 4 on any day, lifetime risk of harm from alcohol is low | NHMRC (2020), as above |
| Cravings rise, peak and pass, usually within 15–30 minutes ("urge surfing") | Common relapse-prevention guidance (e.g. Marlatt's urge surfing); Turning Point / Hello Sunday Morning resources |
| National Alcohol and Other Drug Hotline 1800 250 015 (24/7, free, confidential) | health.gov.au/contacts/national-alcohol-and-other-drug-hotline |
| Lifeline 13 11 14 | lifeline.org.au |
| Counselling Online (24/7 text counselling for alcohol and drugs) | counsellingonline.org.au |

## Plan rules (js/plan.js)

These are app design decisions based on the guidance above, not clinical rules. Review them with a clinician before public release.

- Paces: Gentle 10% a week; Steady 17% a week (about 10% every four days); Quicker 25% a week, which isn't offered from 35+ a week.
- Every step drops by at least one drink a week, so plans always finish.
- No alcohol-free days while a step is above 28 a week (about 4 a day). After that they're added one at a time, up to the user's target.
- While a step is above 28 a week, the daily limit is the weekly limit spread evenly. At or below that, drinking days can go up to 4, and the weekly limit keeps it in check.
- While tapering from heavy drinking, the app never suggests an alcohol-free day to make up for going over. It suggests keeping the next days steady instead.

## Wording rules

- Use "might", "often" and "many people", because nothing is guaranteed for everyone.
- Never suggest a level of drinking is "safe". Say it lowers risk.
- Keep the withdrawal warning visible during the first week for anyone in "take a break" or "stop" mode whose baseline is 35+ a week, or who logged 8+ in a day in the last fortnight. These thresholds are a cautious app heuristic, not a clinical cut-off. Review them with a clinician.
