// What to tell the user as they go: the gains they might notice, and the hard parts
// they might feel, at each stage of an alcohol-free stretch or a cut-back.
//
// Content is general information written for adults, not medical advice. Each claim is
// referenced in docs/CONTENT-SOURCES.md. Keep the tone plain, warm and non-judgemental:
// "you might notice", never "you will", and never shame a slip.

import { toKey } from './dates.js';
import { dayTotal } from './store.js';
import { currentAfStreak, heaviestRecentDay, hoursAlcoholFree, weekSummary } from './stats.js';

export const PHASES = [
  {
    id: 'day1',
    fromHours: 0,
    title: 'The first day',
    gains: [
      'Your body is clearing the last of the alcohol, at roughly one standard drink an hour.',
      'Blood sugar starts to steady, so energy dips and late-night snacking cravings often ease.',
      'By tonight you are likely better hydrated than on a drinking night.',
    ],
    hard: [
      'Cravings often turn up at your usual drinking time, like after work or with dinner. They peak and pass, usually within 15 to 30 minutes.',
      'If you drank a lot recently, you might feel anxious or on edge today. That "hangxiety" is common and fades.',
    ],
  },
  {
    id: 'days2-3',
    fromHours: 24,
    title: 'Days two and three',
    gains: [
      'Digestion and hydration keep settling. Reflux and an unsettled stomach often ease.',
      'Mornings start without a hangover, which many people notice first.',
    ],
    hard: [
      'Sleep can be lighter or broken for the first few nights while your brain adjusts to sleeping without alcohol.',
      'Irritability, restlessness or low-level anxiety are common now and usually ease within the week.',
    ],
    safety: true,
  },
  {
    id: 'week1',
    fromHours: 72,
    title: 'The rest of week one',
    gains: [
      'Sleep starts to rebalance. Alcohol suppresses REM (dreaming) sleep, and your brain is catching up on it.',
      'Many people notice more energy and a clearer head by the end of the first week.',
    ],
    hard: [
      'Vivid dreams, including dreams about drinking, are a normal part of REM catching up. They are not a sign of failure.',
      'Evenings and weekends can feel long or boring once the drinking ritual is gone. That gap is worth planning for.',
    ],
  },
  {
    id: 'week2',
    fromHours: 168,
    title: 'Week two',
    gains: [
      'Sleep is usually deeper and more refreshing, so mornings get easier.',
      'Skin often looks less puffy as hydration improves.',
      'Concentration and memory tend to sharpen.',
    ],
    hard: [
      'The early buzz of "I\'m doing it" can fade, and some people feel flat for a while. Your brain\'s reward system is recalibrating.',
      'Feelings that alcohol used to dull, like stress, worry or sadness, can feel louder. That is normal and tends to settle.',
    ],
  },
  {
    id: 'weeks3-4',
    fromHours: 336,
    title: 'Weeks three and four',
    gains: [
      'In a study of people who took a month off, blood pressure, insulin resistance and weight all improved on average.',
      'Fat in the liver can start to reduce within weeks of stopping.',
      'You have probably saved a noticeable amount of money by now.',
    ],
    hard: [
      'The "one won\'t hurt" thought often shows up once things feel easier. Notice it and decide on purpose.',
      'Social events can bring fear of missing out. Having a go-to alcohol-free order ready helps.',
    ],
  },
  {
    id: 'months1-3',
    fromHours: 672,
    title: 'Months one to three',
    gains: [
      'Liver function continues to improve. In many people early fatty liver can reverse with time off alcohol.',
      'Mood and anxiety are often steadier than when drinking.',
      'New routines start to feel like your own rather than a rule you are following.',
    ],
    hard: [
      'First big occasions without alcohol, like birthdays, holidays or a hard week, can be tough. Plan for them ahead of time.',
      'Cravings can pop up out of nowhere even after weeks. They are weaker and pass faster than they used to.',
    ],
  },
  {
    id: 'months3plus',
    fromHours: 2160,
    title: 'Three months and beyond',
    gains: [
      'Alcohol is linked to at least seven types of cancer, and the risk falls the longer you go without it.',
      'Heart health, sleep and mood benefits build over months and years.',
      'You have shown yourself you can change a habit, and that carries over into other parts of life.',
    ],
    hard: [
      'Occasional cravings can still surface, often linked to old cues. That is normal, not a sign something is wrong.',
      'It is easy to underrate how far you have come. Look back at your calendar now and then.',
    ],
  },
];

export function phaseForHours(hours) {
  let current = PHASES[0];
  for (const p of PHASES) if (hours >= p.fromHours) current = p;
  return current;
}

export function phaseIndex(id) {
  return PHASES.findIndex((p) => p.id === id);
}

// What cutting back (rather than stopping) can bring, and what makes it hard.
export const CUTBACK = {
  gains: [
    'Fewer drinks means less risk. The Australian guidelines say no more than 10 standard drinks a week and no more than 4 on any day keeps the lifetime risk of harm low.',
    'Alcohol-free nights give you better sleep on those nights, and you will often feel the difference the next morning.',
    'Regular alcohol-free days help stop your tolerance creeping up, so you notice when you drink more.',
  ],
  hard: [
    'Moderating means making more decisions than stopping does. Deciding your number before you start makes it easier.',
    'Some days you will go over. One big day does not undo a good week. Log it honestly and carry on.',
    'Friends might top up your glass or question the change. A simple "I\'m pacing myself this week" is enough.',
  ],
};

export const CRAVING_TIPS = [
  'Have a glass of water or something fizzy and cold first.',
  'Notice where you feel the urge in your body. Breathe slowly into it, in for four and out for six.',
  'Change rooms, or step outside for a few minutes.',
  'Text someone. You do not have to mention the craving.',
  'Remind yourself why you started. Your reasons are in Settings if you wrote them down.',
  'Eat something. Hunger and tiredness make cravings louder.',
  'Urges are like waves. They rise, peak and fall, usually within 15 to 30 minutes.',
];

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const plural = (n, word) => `${fmtNum(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * A short line for the Today screen, updated as drinks are tapped in.
 * Returns { tone: 'calm' | 'nudge' | 'limit', text }.
 */
export function todayMessage(state, todayKey_, now = new Date()) {
  const { dailyLimit, weeklyLimit, goalMode } = state.settings;
  const day = state.days[todayKey_];
  const total = dayTotal(day);
  const week = weekSummary(state, todayKey_, todayKey_);

  if (total === 0) {
    const streak = currentAfStreak(state, todayKey_);
    if (day) return { tone: 'calm', text: streak > 1 ? `Alcohol-free today. That's ${streak} days in a row.` : 'Alcohol-free today.' };
    if (goalMode === 'cutback') {
      return { tone: 'calm', text: `${plural(week.total, 'drink')} so far this week, against your limit of ${weeklyLimit}.` };
    }
    return { tone: 'calm', text: streak > 0 ? `${plural(streak, 'day')} alcohol-free so far. Tap the glass if you have a drink, or mark today alcohol-free tonight.` : 'Tap the glass when you have a drink, or mark today alcohol-free tonight.' };
  }

  if (goalMode !== 'cutback') {
    return {
      tone: 'nudge',
      text: 'Slips are part of most people\'s path. Logging it honestly is the important part. Your streak restarts, but what you have built doesn\'t disappear.',
    };
  }

  if (total > dailyLimit) {
    return {
      tone: 'limit',
      text: `You're past your daily limit of ${dailyLimit}. If you'd like to stop here, switching to water or something alcohol-free now makes it easier.`,
    };
  }
  if (total >= dailyLimit) {
    return { tone: 'limit', text: `That's your daily limit of ${dailyLimit}. Tomorrow starts fresh.` };
  }
  if (week.total > weeklyLimit) {
    return { tone: 'nudge', text: `That puts you at ${fmtNum(week.total)} for the week, over your limit of ${weeklyLimit}. An alcohol-free day or two will help even it out.` };
  }
  const left = Math.round((dailyLimit - total) * 10) / 10;
  return {
    tone: 'calm',
    text: `${plural(total, 'standard drink')} today, ${fmtNum(left)} under your daily limit. Your body clears about one an hour, so spacing them out with water helps.`,
  };
}

/** "Last one 25 min ago" pacing note, only for drinks tapped in today. */
export function paceNote(state, todayKey_, now = new Date()) {
  const day = state.days[todayKey_];
  if (!day || !day.entries.length) return null;
  const last = new Date(day.entries[day.entries.length - 1].t);
  const mins = Math.round((now - last) / 60000);
  if (mins < 0 || mins > 360) return null;
  if (mins < 1) return 'Last drink just now';
  if (mins < 60) return `Last drink ${mins} min ago`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `Last drink ${h} h ${m ? `${m} min ` : ''}ago`;
}

/**
 * Whether to show the "talk to a GP before stopping" card. Shown to people taking a break
 * or stopping whose baseline or recent days suggest heavier daily drinking, during the
 * first week, when withdrawal risk is highest.
 */
export function needsWithdrawalCaution(state, now = new Date()) {
  const { goalMode, baselinePerWeek } = state.settings;
  if (goalMode === 'cutback') return false;
  const heavyBaseline = Number(baselinePerWeek) >= 35; // about 5 or more most days
  const todayKey_ = toKey(now);
  const heavyRecent = heaviestRecentDay(state, todayKey_, 14) >= 8;
  return (heavyBaseline || heavyRecent) && hoursAlcoholFree(state, now) < 24 * 7;
}

export const SAFETY_TEXT =
  'If you have been drinking heavily most days, stopping suddenly can cause alcohol withdrawal, which can be dangerous. ' +
  'Signs include shaking, sweating, a racing heart, nausea, strong anxiety, confusion or seeing things that aren\'t there, usually starting 6 to 72 hours after the last drink. ' +
  'Talk to a GP before you stop. They can help you do it safely. If someone has a seizure or is very confused, call 000.';

export const SUPPORT = [
  { name: 'National Alcohol and Other Drug Hotline', detail: 'Free, confidential, 24/7. Connects you to your state\'s service.', phone: '1800 250 015' },
  { name: 'Lifeline', detail: 'Crisis support, 24/7.', phone: '13 11 14' },
  { name: 'Counselling Online', detail: 'Free text-based alcohol and drug counselling, 24/7.', url: 'https://www.counsellingonline.org.au' },
  { name: 'Emergency', detail: 'If someone is in danger, has a seizure or is very unwell.', phone: '000' },
];
