const WEEKS_PER_YEAR = 52;

const SLEEP_RATES = [
  { min: 0, max: 1, hoursPerDay: 14 },
  { min: 1, max: 3, hoursPerDay: 12 },
  { min: 3, max: 6, hoursPerDay: 11 },
  { min: 6, max: 13, hoursPerDay: 10 },
  { min: 13, max: 18, hoursPerDay: 9 },
  { min: 18, max: 65, hoursPerDay: 8 },
  { min: 65, max: 130, hoursPerDay: 7 }
];

const ACTIVITY_FIELDS = [
  {
    inputId: "screenTime",
    key: "phone",
    cssClass: "phone",
    inputLabel: "screen time",
    summaryLabel: "Projected future phone time",
    titleLabel: "projected phone time"
  },
  {
    inputId: "workTime",
    key: "work",
    cssClass: "work",
    inputLabel: "work",
    summaryLabel: "Projected future work",
    titleLabel: "projected work"
  },
  {
    inputId: "eatingTime",
    key: "eating",
    cssClass: "eating",
    inputLabel: "eating + meal prep",
    summaryLabel: "Projected future eating + meal prep",
    titleLabel: "projected eating + meal prep"
  },
  {
    inputId: "hygieneTime",
    key: "hygiene",
    cssClass: "hygiene",
    inputLabel: "hygiene + bathroom",
    summaryLabel: "Projected future hygiene + bathroom",
    titleLabel: "projected hygiene + bathroom"
  },
  {
    inputId: "choresTime",
    key: "chores",
    cssClass: "chores",
    inputLabel: "household chores/admin",
    summaryLabel: "Projected future chores + admin",
    titleLabel: "projected chores + admin"
  },
  {
    inputId: "commuteTime",
    key: "commute",
    cssClass: "commute",
    inputLabel: "commuting/transport",
    summaryLabel: "Projected future commuting + transport",
    titleLabel: "projected commuting + transport"
  },
  {
    inputId: "errandsTime",
    key: "errands",
    cssClass: "errands",
    inputLabel: "errands/shopping",
    summaryLabel: "Projected future errands + shopping",
    titleLabel: "projected errands + shopping"
  }
];

const controls = document.getElementById("controls");
const ageInput = document.getElementById("age");
const lifeExpectancyInput = document.getElementById("lifeExpectancy");
const validationMessage = document.getElementById("validationMessage");
const summaryEl = document.getElementById("summary");
const completedGridEl = document.getElementById("completedWeeksGrid");
const sleepGridEl = document.getElementById("sleepWeeksGrid");
const workGridEl = document.getElementById("workWeeksGrid");
const activitiesGridEl = document.getElementById("activitiesWeeksGrid");
const remainingGridEl = document.getElementById("remainingWeeksGrid");
const completedMetaEl = document.getElementById("completedMeta");
const sleepMetaEl = document.getElementById("sleepMeta");
const workMetaEl = document.getElementById("workMeta");
const activitiesMetaEl = document.getElementById("activitiesMeta");
const remainingMetaEl = document.getElementById("remainingMeta");
const remainingBreakdownEl = document.getElementById("remainingBreakdown");

const activityInputs = ACTIVITY_FIELDS.map((field) => ({
  ...field,
  element: document.getElementById(field.inputId)
}));

const PROJECTED_ACTIVITY_KEYS = ["eating", "hygiene", "chores", "commute", "errands"];
const REMAINING_AWAKE_KEYS = ["phone", "free"];

function getWorkScaleForAge(ageYears) {
  if (ageYears < 18 || ageYears >= 65) return 0;
  return 1;
}

function getSleepHoursForAge(ageYears) {
  return (
    SLEEP_RATES.find((band) => ageYears >= band.min && ageYears < band.max)?.hoursPerDay ??
    SLEEP_RATES[SLEEP_RATES.length - 1].hoursPerDay
  );
}

function formatWeeks(weeks) {
  return `${weeks.toLocaleString()} weeks`;
}

function formatYears(weeks) {
  return `${(weeks / WEEKS_PER_YEAR).toFixed(1)} years`;
}

function allocateRoundedWeeks(totalWeeks, floatWeeksByKey) {
  const allocations = Object.fromEntries(Object.keys(floatWeeksByKey).map((key) => [key, 0]));
  const entries = Object.entries(floatWeeksByKey).map(([key, weeksFloat]) => {
    const safeFloat = Number.isFinite(weeksFloat) ? Math.max(0, weeksFloat) : 0;
    const floorWeeks = Math.floor(safeFloat);

    allocations[key] = floorWeeks;
    return {
      key,
      floorWeeks,
      remainder: safeFloat - floorWeeks
    };
  });

  let assigned = entries.reduce((sum, entry) => sum + entry.floorWeeks, 0);
  let delta = totalWeeks - assigned;

  if (delta > 0) {
    const byRemainderDesc = [...entries].sort((a, b) => b.remainder - a.remainder);
    let index = 0;
    while (delta > 0 && byRemainderDesc.length > 0) {
      const entry = byRemainderDesc[index % byRemainderDesc.length];
      allocations[entry.key] += 1;
      delta -= 1;
      index += 1;
    }
  }

  if (delta < 0) {
    const byRemainderAsc = [...entries].sort((a, b) => a.remainder - b.remainder);
    let index = 0;
    while (delta < 0 && byRemainderAsc.length > 0) {
      const entry = byRemainderAsc[index % byRemainderAsc.length];
      if (allocations[entry.key] > 0) {
        allocations[entry.key] -= 1;
        delta += 1;
      }
      index += 1;
    }
  }

  return allocations;
}

function parseInputs() {
  const age = Number.parseFloat(ageInput.value);
  const lifeExpectancy = Number.parseFloat(lifeExpectancyInput.value);

  if (!Number.isFinite(age) || age < 0 || age > 120) {
    return { error: "Enter an age between 0 and 120." };
  }

  if (!Number.isFinite(lifeExpectancy) || lifeExpectancy <= 0 || lifeExpectancy > 120) {
    return { error: "Enter life expectancy between 1 and 120 years." };
  }

  if (age > lifeExpectancy) {
    return { error: "Age cannot be greater than life expectancy." };
  }

  const activityHours = {};

  for (const field of activityInputs) {
    const value = Number.parseFloat(field.element.value);
    if (!Number.isFinite(value) || value < 0 || value > 24) {
      return {
        error: `Enter ${field.inputLabel} between 0 and 24 hours per day.`
      };
    }

    activityHours[field.key] = value;
  }

  return { age, lifeExpectancy, activityHours };
}

function calculateModel({ age, lifeExpectancy, activityHours }) {
  const totalWeeks = Math.round(lifeExpectancy * WEEKS_PER_YEAR);
  const livedWeeks = Math.round(age * WEEKS_PER_YEAR);
  const futureWeeks = Math.max(0, totalWeeks - livedWeeks);

  let dailyClampedWeeks = 0;

  const futureFloatWeeks = {
    sleep: 0,
    phone: 0,
    work: 0,
    eating: 0,
    hygiene: 0,
    chores: 0,
    commute: 0,
    errands: 0,
    free: 0
  };

  for (let week = 0; week < futureWeeks; week += 1) {
    const ageThisWeek = age + week / WEEKS_PER_YEAR;
    const sleepHoursPerDay = getSleepHoursForAge(ageThisWeek);
    const awakeHoursPerDay = Math.max(0, 24 - sleepHoursPerDay);

    const workScale = getWorkScaleForAge(ageThisWeek);

    const requestedAwakeHours = activityInputs.reduce(
      (sum, field) => {
        const hours = field.key === "work" ? activityHours[field.key] * workScale : activityHours[field.key];
        return sum + hours;
      },
      0
    );

    const clampScale = requestedAwakeHours > awakeHoursPerDay ? awakeHoursPerDay / requestedAwakeHours : 1;

    if (clampScale < 1) {
      dailyClampedWeeks += 1;
    }

    futureFloatWeeks.sleep += sleepHoursPerDay / 24;

    for (const field of activityInputs) {
      const hours = field.key === "work" ? activityHours[field.key] * workScale : activityHours[field.key];
      futureFloatWeeks[field.key] += (hours * clampScale) / 24;
    }

    const usedAwakeHours = requestedAwakeHours * clampScale;
    futureFloatWeeks.free += Math.max(0, awakeHoursPerDay - usedAwakeHours) / 24;
  }

  const roundedWeeks = allocateRoundedWeeks(futureWeeks, futureFloatWeeks);

  const futureSegments = [
    {
      key: "sleep",
      cssClass: "sleep",
      titleLabel: "projected sleep",
      weeks: roundedWeeks.sleep
    },
    ...activityInputs.map((field) => ({
      key: field.key,
      cssClass: field.cssClass,
      titleLabel: field.titleLabel,
      weeks: roundedWeeks[field.key]
    })),
    {
      key: "free",
      cssClass: "free",
      titleLabel: "other future time",
      weeks: roundedWeeks.free
    }
  ];

  const lifetimePhoneWeeks = Math.round(totalWeeks * (activityHours.phone / 24));

  return {
    totalWeeks,
    livedWeeks,
    futureWeeks,
    futureSegments,
    segmentWeeks: roundedWeeks,
    lifetimePhoneWeeks,
    dailyClampedWeeks
  };
}

function renderSummary(model) {
  const stats = [
    { label: "Weeks lived", value: `${formatWeeks(model.livedWeeks)} (${formatYears(model.livedWeeks)})` },
    {
      label: "Projected future sleep",
      value: `${formatWeeks(model.segmentWeeks.sleep)} (${formatYears(model.segmentWeeks.sleep)})`
    },
    ...activityInputs.map((field) => ({
      label: field.summaryLabel,
      value: `${formatWeeks(model.segmentWeeks[field.key])} (${formatYears(model.segmentWeeks[field.key])})`
    })),
    {
      label: "Other future time",
      value: `${formatWeeks(model.segmentWeeks.free)} (${formatYears(model.segmentWeeks.free)})`
    },
    {
      label: "Phone time over full life (at current average)",
      value: `${formatWeeks(model.lifetimePhoneWeeks)} (${formatYears(model.lifetimePhoneWeeks)})`
    }
  ];

  if (!summaryEl) return;
  summaryEl.innerHTML = stats
    .map(
      (stat) => `
        <article class="stat">
          <div class="label">${stat.label}</div>
          <div class="value">${stat.value}</div>
        </article>
      `
    )
    .join("");
}

function renderGrid(model) {
  const completedFragment = document.createDocumentFragment();
  const sleepFragment = document.createDocumentFragment();
  const workFragment = document.createDocumentFragment();
  const activitiesFragment = document.createDocumentFragment();
  const remainingFragment = document.createDocumentFragment();

  const sleepWeeks = model.segmentWeeks.sleep;
  const workWeeks = model.segmentWeeks.work ?? 0;
  const projectedActivityWeeks = PROJECTED_ACTIVITY_KEYS.reduce(
    (sum, key) => sum + (model.segmentWeeks[key] ?? 0),
    0
  );
  const remainingAwakeWeeks = REMAINING_AWAKE_KEYS.reduce(
    (sum, key) => sum + (model.segmentWeeks[key] ?? 0),
    0
  );
  const futureSegmentsByKey = new Map(model.futureSegments.map((segment) => [segment.key, segment]));

  completedMetaEl.textContent = formatWeeks(model.livedWeeks);
  sleepMetaEl.textContent = formatWeeks(sleepWeeks);
  workMetaEl.textContent = formatWeeks(workWeeks);
  activitiesMetaEl.textContent = formatWeeks(projectedActivityWeeks);
  remainingMetaEl.textContent = formatWeeks(remainingAwakeWeeks);

  if (remainingBreakdownEl && remainingAwakeWeeks > 0) {
    const phoneWeeks = model.segmentWeeks.phone ?? 0;
    const freeWeeks = model.segmentWeeks.free ?? 0;
    const phonePct = Math.round((phoneWeeks / remainingAwakeWeeks) * 100);
    const freePct = 100 - phonePct;
    remainingBreakdownEl.textContent = `${phonePct}% screen · ${freePct}% free`;
  }

  for (let week = 0; week < model.livedWeeks; week += 1) {
    const box = document.createElement("div");
    box.className = "week lived";
    box.title = `Completed week ${week + 1}`;
    completedFragment.appendChild(box);
  }

  for (let week = 0; week < sleepWeeks; week += 1) {
    const box = document.createElement("div");
    box.className = "week sleep";
    box.title = `Projected sleep week ${week + 1}`;
    sleepFragment.appendChild(box);
  }

  for (let week = 0; week < workWeeks; week += 1) {
    const box = document.createElement("div");
    box.className = "week work";
    box.title = `Projected work week ${week + 1}`;
    workFragment.appendChild(box);
  }

  for (const key of PROJECTED_ACTIVITY_KEYS) {
    const segment = futureSegmentsByKey.get(key);
    if (!segment) {
      continue;
    }

    for (let week = 0; week < segment.weeks; week += 1) {
      const box = document.createElement("div");
      box.className = `week ${segment.cssClass}`;
      box.title = segment.titleLabel;
      activitiesFragment.appendChild(box);
    }
  }

  for (const key of REMAINING_AWAKE_KEYS) {
    const segment = futureSegmentsByKey.get(key);
    if (!segment) {
      continue;
    }

    for (let week = 0; week < segment.weeks; week += 1) {
      const box = document.createElement("div");
      box.className = `week ${segment.cssClass}`;
      box.title = segment.titleLabel;
      remainingFragment.appendChild(box);
    }
  }

  completedGridEl.replaceChildren(completedFragment);
  sleepGridEl.replaceChildren(sleepFragment);
  workGridEl.replaceChildren(workFragment);
  activitiesGridEl.replaceChildren(activitiesFragment);
  remainingGridEl.replaceChildren(remainingFragment);
}

function updateVisualization() {
  const parsed = parseInputs();

  if (parsed.error) {
    validationMessage.textContent = parsed.error;
    return;
  }

  validationMessage.textContent = "";

  const model = calculateModel(parsed);
  renderSummary(model);
  renderGrid(model);
}

controls.addEventListener("submit", (event) => {
  event.preventDefault();
  updateVisualization();
});

[ageInput, lifeExpectancyInput, ...activityInputs.map((field) => field.element)].forEach((input) => {
  input.addEventListener("input", () => {
    updateVisualization();
  });
});

updateVisualization();
