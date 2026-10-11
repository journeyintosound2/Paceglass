// What to tell the user as they go: the gains they might notice, and the hard parts
// they might feel, at each stage of an alcohol-free stretch or a cut-back.
//
// Content is general information written for adults, not medical advice. Each claim is
// referenced in docs/CONTENT-SOURCES.md. Keep the tone plain, warm and non-judgemental:
// "you might notice", never "you will", and never shame a slip.

import { addDays, toKey } from './dates.js';
import { limitsOn } from './limits.js';
import { AF_DAYS_FROM_WEEKLY, HEAVY_PER_WEEK } from './plan.js';
import { dayTotal } from './store.js';
import { currentAfStreak, heaviestRecentDay, hoursAlcoholFree, summariseRange, weekSummary } from './stats.js';

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
  const { goalMode } = state.settings;
  const lim = limitsOn(state, todayKey_);
  const day = state.days[todayKey_];
  const total = dayTotal(day);
  const week = lim.fromPlan
    ? { total: summariseRange(state, lim.pos.step.start, addDays(lim.pos.step.start, 6), todayKey_).total }
    : weekSummary(state, todayKey_, todayKey_);
  const weekWord = lim.fromPlan ? 'this plan week' : 'this week';

  if (total === 0) {
    const streak = currentAfStreak(state, todayKey_);
    if (day) return { tone: 'calm', text: streak > 1 ? `Alcohol-free today. That's ${streak} days in a row.` : 'Alcohol-free today.' };
    if (goalMode === 'cutback') {
      if (lim.fromPlan && lim.daily > 0) {
        return { tone: 'calm', text: `Today's limit is ${lim.daily}. ${plural(week.total, 'drink')} so far ${weekWord}, out of ${lim.weekly}.` };
      }
      return { tone: 'calm', text: `${plural(week.total, 'drink')} so far ${weekWord}, against your limit of ${lim.weekly}.` };
    }
    return { tone: 'calm', text: streak > 0 ? `${plural(streak, 'day')} alcohol-free so far. Tap the glass if you have a drink, or mark today alcohol-free tonight.` : 'Tap the glass when you have a drink, or mark today alcohol-free tonight.' };
  }

  if (goalMode !== 'cutback' || lim.daily === 0) {
    return {
      tone: 'nudge',
      text: 'Slips are part of most people\'s path. Logging it honestly is the important part. Your streak restarts, but what you have built doesn\'t disappear.',
    };
  }

  const tapering = lim.fromPlan && lim.weekly > AF_DAYS_FROM_WEEKLY;
  if (total > lim.daily) {
    return {
      tone: 'limit',
      text: `You're past today's limit of ${lim.daily}. If you'd like to stop here, switching to water or something alcohol-free now makes it easier.`,
    };
  }
  if (total >= lim.daily) {
    return { tone: 'limit', text: `That's today's limit of ${lim.daily}. Tomorrow starts fresh.` };
  }
  if (week.total > lim.weekly) {
    return {
      tone: 'nudge',
      text: tapering
        ? `That puts you at ${fmtNum(week.total)} for ${weekWord}, over the ${lim.weekly} planned. Keep the coming days steady rather than stopping suddenly. That's safer while your body adjusts.`
        : `That puts you at ${fmtNum(week.total)} for ${weekWord}, over your limit of ${lim.weekly}. An alcohol-free day or two will help even it out.`,
    };
  }
  const left = Math.round((lim.daily - total) * 10) / 10;
  return {
    tone: 'calm',
    text: `${plural(total, 'standard drink')} today, ${fmtNum(left)} under today's limit. Your body clears about one an hour, so spacing them out with water helps.`,
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

// ---------------------------------------------------------------- step-down plans

/** Signs that need an ambulance (000), from NHS guidance on cutting down at home. */
export const URGENT_WITHDRAWAL_SIGNS = [
  'A seizure (fit)',
  'Confusion',
  'Seeing or hearing things that aren\'t there',
  'Double vision',
  'Being very unsteady on your feet',
];

/** Common, milder signs that the plan is going a bit fast. */
export const MILD_WITHDRAWAL_SIGNS = [
  'Shaky hands, especially in the morning',
  'Sweating',
  'Feeling sick, or a headache',
  'Anxiety, restlessness or irritability',
  'Trouble getting to sleep',
];

/**
 * What to expect at each stage of cutting back. Chosen by where the current step sits:
 * average per day, how far down from the starting point, and whether it's the final step.
 */
export const PLAN_STAGES = [
  {
    id: 'start',
    title: 'Starting to cut back',
    when: 'First step',
    gains: [
      'Each step down means less alcohol for your liver, heart and brain to deal with every day.',
      'You are likely to notice lighter hangovers and slightly clearer mornings early on.',
      'Spending drops straight away. Check Insights to see what you are not spending.',
    ],
    hard: [
      'When you drink less than your body is used to, you might feel shaky, sweaty, anxious or restless, or sleep badly. Mild symptoms are common and settle as your body adjusts.',
      'If symptoms are more than mild, the plan is moving too fast for you. Use "I\'m getting symptoms" to slow it down.',
      'Spread your drinks evenly across the day and the week. Saving them up for one big session undoes the point of tapering.',
    ],
  },
  {
    id: 'early',
    title: 'Coming down',
    when: 'Still above 4 a day on average',
    gains: [
      'Blood pressure tends to come down as heavy drinking comes down.',
      'Sleep often starts to improve on lower nights, even before you reach your target.',
      'Many people find their mood is steadier and their patience longer.',
    ],
    hard: [
      'The times you would usually drink more, like after work or late evening, are often the hardest. Have something else ready for those moments.',
      'Counting and planning can feel like a chore. It gets more automatic after a few weeks.',
      'Keep each day close to the plan rather than having alcohol-free days yet. Sudden stops are what bring on stronger withdrawal.',
    ],
  },
  {
    id: 'af-days',
    title: 'Adding alcohol-free days',
    when: 'Around 4 a day or less',
    gains: [
      'Alcohol-free days give your liver a regular break and help stop tolerance creeping back up.',
      'Sleep on alcohol-free nights is usually deeper and more refreshing, once you are used to it.',
    ],
    hard: [
      'The first few alcohol-free days in a long while can bring cravings, restlessness or a poor night\'s sleep. That usually eases with each one.',
      'Plan those evenings: a walk, a call, a film, a different drink in a nice glass.',
    ],
  },
  {
    id: 'halfway',
    title: 'Halfway and beyond',
    when: 'Drinking half or less of what you started at',
    gains: [
      'The risk of alcohol-related injury, liver disease, heart disease and several cancers falls as drinking falls.',
      'Weight, skin and energy often improve noticeably by now.',
      'You have proved you can change this. That counts for a lot.',
    ],
    hard: [
      'Plateaus are normal. A week where you repeat a step is still progress.',
      'The "I\'ve done enough now" thought is common around here. Remind yourself of your reasons.',
    ],
  },
  {
    id: 'target',
    title: 'At your target',
    when: 'Final step',
    gains: [
      'At 10 or fewer a week, and no more than 4 on any day, your lifetime risk of harm from alcohol is low.',
      'From here your calendar becomes a way to keep things steady, not a countdown.',
    ],
    hard: [
      'Holidays, celebrations and stressful weeks can pull things back up. Decide your number before you start.',
      'If you slip back up for a while, you can build a new plan from wherever you are.',
    ],
  },
];

export function planStageFor(plan, index) {
  if (!plan) return null;
  const step = plan.steps[index];
  const isLast = index === plan.steps.length - 1;
  if (isLast) return PLAN_STAGES.find((s) => s.id === 'target');
  if (index === 0) return PLAN_STAGES[0];
  if (step.weekly <= plan.currentPerWeek / 2) return PLAN_STAGES.find((s) => s.id === 'halfway');
  if (step.weekly <= AF_DAYS_FROM_WEEKLY) return PLAN_STAGES.find((s) => s.id === 'af-days');
  return PLAN_STAGES.find((s) => s.id === 'early');
}

/** Show a "build a step-down plan" suggestion: cutting back from well above the limit, no plan yet. */
export function shouldSuggestPlan(state) {
  const { goalMode, plan, baselinePerWeek, weeklyLimit } = state.settings;
  const base = Number(baselinePerWeek) || 0;
  if (plan) return false;
  if (goalMode === 'cutback') return base >= 21 && base >= 2 * (Number(weeklyLimit) || 0);
  return base >= HEAVY_PER_WEEK; // stopping from heavy drinking: a gradual plan is safer
}

export const PLAN_SAFETY_TEXT =
  'Cutting down gradually is safer than stopping suddenly, but if you have been drinking heavily every day you can still get withdrawal symptoms. ' +
  'Talk to your GP before you start. They can check your plan, and some people need medication to cut down safely. ' +
  'If you have ever had a seizure or hallucinations when stopping or cutting down, don\'t do this on your own. Get medical help first.';
