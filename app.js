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
  { inputId: "screenTime", key: "phone", cssClass: "phone", inputLabel: "screen time" },
  { inputId: "workTime", key: "work", cssClass: "work", inputLabel: "work" },
  { inputId: "eatingTime", key: "eating", cssClass: "eating", inputLabel: "eating + meal prep" },
  { inputId: "hygieneTime", key: "hygiene", cssClass: "hygiene", inputLabel: "hygiene + bathroom" },
  { inputId: "choresTime", key: "chores", cssClass: "chores", inputLabel: "household chores/admin" },
  { inputId: "commuteTime", key: "commute", cssClass: "commute", inputLabel: "commuting/transport" },
  { inputId: "errandsTime", key: "errands", cssClass: "errands", inputLabel: "errands/shopping" }
];

const PROJECTED_ACTIVITY_KEYS = ["eating", "hygiene", "chores", "commute", "errands"];
const REMAINING_AWAKE_KEYS = ["phone", "free"];
const ACTIVITIES_SUBCATEGORIES = ["eating", "hygiene", "chores", "commute", "errands"];

const STORY_STEPS = [
  { id: "sleep", label: "Sleep", categories: ["sleep"], targetSectionId: "section-sleep" },
  { id: "work", label: "Work", categories: ["work"], targetSectionId: "section-work" },
  {
    id: "activities",
    label: "Activities",
    categories: ACTIVITIES_SUBCATEGORIES,
    targetSectionId: "section-activities"
  },
  {
    id: "whats-left",
    label: "What's Left",
    categories: REMAINING_AWAKE_KEYS,
    targetSectionId: "section-whats-left",
    effect: "screen"
  }
];

const BREAKOFF_TRIGGER = 0.2;
const STEP_ENTRY_TRIGGER = 0.12;
const STEP_COLOR_TRIGGER = 0.28;
const STEP_EXTRACT_TRIGGER = 0.62;
const BREAKOFF_DURATION_MS = 780;
const PEEL_DURATION_MS = 720;
const PEEL_STAGGER_MS = 220;
const POST_STEP_LOCK_MS = 380;
const FINAL_EFFECT_MS = 1200;

const ageInput = document.getElementById("age");
const lifeExpectancyInput = document.getElementById("lifeExpectancy");
const validationMessage = document.getElementById("validationMessage");

const visualizationEl = document.getElementById("visualization");
const progressDotsEl = document.getElementById("progressDots");
const scrollCueEl = document.getElementById("scrollCue");
const scrollBufferEl = document.querySelector(".scroll-buffer");
const sourcesSectionEl = document.querySelector(".sources");

const introSectionEl = document.getElementById("section-intro");
const introGridEl = document.getElementById("introWeeksGrid");
const introMetaEl = document.getElementById("introMeta");

const stageSectionEl = document.getElementById("section-stage");
const stageGridEl = document.getElementById("remainingStageGrid");
const stageRailEl = document.getElementById("stageRail");
const stageKickerEl = document.getElementById("stageKicker");
const stageTitleEl = document.getElementById("stageTitle");
const stageMetaEl = document.getElementById("stageMeta");

const sleepGridEl = document.getElementById("sleepWeeksGrid");
const workGridEl = document.getElementById("workWeeksGrid");
const activitiesGridEl = document.getElementById("activitiesWeeksGrid");
const whatsLeftGridEl = document.getElementById("whatsLeftGrid");

const sleepMetaEl = document.getElementById("sleepMeta");
const workMetaEl = document.getElementById("workMeta");
const activitiesMetaEl = document.getElementById("activitiesMeta");
const whatsLeftMetaEl = document.getElementById("whatsLeftMeta");
const whatsLeftBreakdownEl = document.getElementById("whatsLeftBreakdown");

const extractedSectionEls = Object.fromEntries(
  STORY_STEPS.map((step) => [step.id, document.getElementById(step.targetSectionId)])
);

const spacerEls = Array.from(document.querySelectorAll(".scroll-spacer"));
const spacerByStep = Object.fromEntries(spacerEls.map((spacer) => [spacer.dataset.step, spacer]));

const activityInputs = ACTIVITY_FIELDS.map((field) => ({
  ...field,
  element: document.getElementById(field.inputId)
}));

const onboardingEl = document.getElementById("onboarding");
const onboardingAgeInput = document.getElementById("onboarding-age");
const onboardingScreenInput = document.getElementById("onboarding-screen");
const onboardingNextBtn = document.getElementById("onboarding-next");
const onboardingGoBtn = document.getElementById("onboarding-go");

const storyState = {
  introSplit: false,
  breakoffAnimating: false,
  narrativeComplete: false,
  lockUntil: 0,
  copySignature: "",
  scrollCueFaded: false,
  stepStates: {},
  stageBoxesByCategory: {},
  finalEffectTimer: null
};

let currentModel = null;
let scrollBound = false;
let scrollTicking = false;

function buildStepStates() {
  return Object.fromEntries(
    STORY_STEPS.map((step) => [
      step.id,
      {
        colorized: false,
        extracting: false,
        extracted: false
      }
    ])
  );
}

function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getWorkScaleForAge(ageYears) {
  if (ageYears < 18 || ageYears >= 65) {
    return 0;
  }

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
    const sorted = [...entries].sort((a, b) => b.remainder - a.remainder);
    let index = 0;

    while (delta > 0 && sorted.length > 0) {
      allocations[sorted[index % sorted.length].key] += 1;
      delta -= 1;
      index += 1;
    }
  }

  if (delta < 0) {
    const sorted = [...entries].sort((a, b) => a.remainder - b.remainder);
    let index = 0;

    while (delta < 0 && sorted.length > 0) {
      const entry = sorted[index % sorted.length];
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
      return { error: `Enter ${field.inputLabel} between 0 and 24 hours per day.` };
    }

    activityHours[field.key] = value;
  }

  return { age, lifeExpectancy, activityHours };
}

function calculateModel({ age, lifeExpectancy, activityHours }) {
  const totalWeeks = Math.round(lifeExpectancy * WEEKS_PER_YEAR);
  const livedWeeks = Math.round(age * WEEKS_PER_YEAR);
  const futureWeeks = Math.max(0, totalWeeks - livedWeeks);

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

    const requestedAwakeHours = activityInputs.reduce((sum, field) => {
      const hours = field.key === "work" ? activityHours[field.key] * workScale : activityHours[field.key];
      return sum + hours;
    }, 0);

    const clampScale =
      requestedAwakeHours > awakeHoursPerDay ? awakeHoursPerDay / requestedAwakeHours : 1;

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
    { key: "sleep", cssClass: "sleep", weeks: roundedWeeks.sleep },
    { key: "work", cssClass: "work", weeks: roundedWeeks.work },
    ...ACTIVITIES_SUBCATEGORIES.map((key) => ({ key, cssClass: key, weeks: roundedWeeks[key] })),
    { key: "phone", cssClass: "phone", weeks: roundedWeeks.phone },
    { key: "free", cssClass: "free", weeks: roundedWeeks.free }
  ];

  return {
    totalWeeks,
    livedWeeks,
    futureWeeks,
    futureSegments,
    segmentWeeks: roundedWeeks
  };
}

function getStepCount(step, model = currentModel) {
  if (!model) {
    return 0;
  }

  return step.categories.reduce((sum, key) => sum + (model.segmentWeeks[key] ?? 0), 0);
}

function populateGrid(gridEl, segments, options = {}) {
  const fragment = document.createDocumentFragment();
  let futureIndex = 0;

  for (const segment of segments) {
    for (let week = 0; week < segment.weeks; week += 1) {
      const box = document.createElement("div");
      box.className = `week ${segment.cssClass}`;

      if (options.neutral) {
        box.className = "week neutral";
      }

      if (segment.phase) {
        box.dataset.phase = segment.phase;
      }

      if (segment.key) {
        box.dataset.category = segment.key;
      }

      if (segment.phase === "future" || options.trackFutureIndex) {
        box.dataset.futureIndex = String(futureIndex);
        futureIndex += 1;
      }

      fragment.appendChild(box);
    }
  }

  gridEl.replaceChildren(fragment);
}

function renderIntroGrid(model) {
  const introSegments = [
    { key: "lived", cssClass: "lived", weeks: model.livedWeeks, phase: "lived" },
    ...model.futureSegments.map((segment) => ({
      key: segment.key,
      cssClass: "neutral",
      weeks: segment.weeks,
      phase: "future"
    }))
  ];

  populateGrid(introGridEl, introSegments);
  introGridEl.querySelectorAll('[data-phase="future"]').forEach((box) => {
    box.classList.add("future-origin");
  });
  introMetaEl.textContent = `${formatWeeks(model.livedWeeks)} completed · ${formatWeeks(model.futureWeeks)} remaining`;
}

function renderStageGrid(model) {
  const stageSegments = model.futureSegments.map((segment) => ({
    key: segment.key,
    cssClass: "neutral",
    weeks: segment.weeks,
    phase: "future"
  }));

  populateGrid(stageGridEl, stageSegments, { neutral: true });
  refreshStageBoxCache();
}

function renderExtractedSections(model) {
  populateGrid(sleepGridEl, [{ key: "sleep", cssClass: "sleep", weeks: model.segmentWeeks.sleep }]);
  sleepMetaEl.textContent = formatWeeks(model.segmentWeeks.sleep);

  populateGrid(workGridEl, [{ key: "work", cssClass: "work", weeks: model.segmentWeeks.work }]);
  workMetaEl.textContent = formatWeeks(model.segmentWeeks.work);

  populateGrid(
    activitiesGridEl,
    ACTIVITIES_SUBCATEGORIES.map((key) => ({
      key,
      cssClass: key,
      weeks: model.segmentWeeks[key]
    }))
  );

  activitiesMetaEl.textContent = formatWeeks(
    ACTIVITIES_SUBCATEGORIES.reduce((sum, key) => sum + (model.segmentWeeks[key] ?? 0), 0)
  );

  populateGrid(
    whatsLeftGridEl,
    REMAINING_AWAKE_KEYS.map((key) => ({
      key,
      cssClass: key,
      weeks: model.segmentWeeks[key]
    }))
  );

  const whatsLeftTotal = REMAINING_AWAKE_KEYS.reduce(
    (sum, key) => sum + (model.segmentWeeks[key] ?? 0),
    0
  );

  whatsLeftMetaEl.textContent = formatWeeks(whatsLeftTotal);

  if (whatsLeftTotal > 0) {
    const phoneWeeks = model.segmentWeeks.phone ?? 0;
    const phonePct = Math.round((phoneWeeks / whatsLeftTotal) * 100);
    whatsLeftBreakdownEl.textContent = `${phonePct}% screen · ${100 - phonePct}% free`;
  } else {
    whatsLeftBreakdownEl.textContent = "0% screen · 100% free";
  }
}

function refreshStageBoxCache() {
  storyState.stageBoxesByCategory = {};

  stageGridEl.querySelectorAll(".week").forEach((box) => {
    const category = box.dataset.category;
    if (!category) {
      return;
    }

    if (!storyState.stageBoxesByCategory[category]) {
      storyState.stageBoxesByCategory[category] = [];
    }

    storyState.stageBoxesByCategory[category].push(box);
  });
}

function resetNarrativeState(model) {
  currentModel = model;
  storyState.introSplit = false;
  storyState.breakoffAnimating = false;
  storyState.narrativeComplete = false;
  storyState.lockUntil = 0;
  storyState.copySignature = "";
  storyState.scrollCueFaded = false;
  storyState.stepStates = buildStepStates();

  if (storyState.finalEffectTimer) {
    clearTimeout(storyState.finalEffectTimer);
    storyState.finalEffectTimer = null;
  }

  introSectionEl.className = "viz-section viz-intro";
  stageSectionEl.className = "viz-section stage-section is-hidden";
  introGridEl.style.height = "";
  stageGridEl.style.height = "";

  scrollCueEl.classList.remove("visible", "fading", "hidden");
  scrollBufferEl.classList.remove("collapsed");
  stageRailEl.classList.remove("is-highlighted", "rail-refresh");

  spacerEls.forEach((spacer) => {
    spacer.classList.remove("collapsed");
  });

  for (const section of Object.values(extractedSectionEls)) {
    section.classList.remove("revealed", "effect-live", "effect-settled");
  }

  updateProgressDot("completed");
  applyRemainingCopy(false);
}

function renderAll(model) {
  renderIntroGrid(model);
  renderStageGrid(model);
  renderExtractedSections(model);
  resetNarrativeState(model);
}

function applyStageCopy(copy, animate = true) {
  const signature = `${copy.kicker}|${copy.title}|${copy.meta}|${copy.highlight}`;
  if (storyState.copySignature === signature) {
    return;
  }

  storyState.copySignature = signature;
  stageKickerEl.textContent = copy.kicker;
  stageTitleEl.textContent = copy.title;
  stageMetaEl.textContent = copy.meta;
  stageRailEl.classList.toggle("is-highlighted", Boolean(copy.highlight));
  stageRailEl.classList.remove("rail-refresh");

  if (animate && !isReducedMotion()) {
    void stageRailEl.offsetWidth;
    stageRailEl.classList.add("rail-refresh");
  }
}

function applyRemainingCopy(animate = true) {
  const remaining = stageGridEl.childElementCount;
  applyStageCopy(
    {
      kicker: "Remaining",
      title: "Remaining",
      meta: `${formatWeeks(remaining)} still in play`,
      highlight: false
    },
    animate
  );
}

function applyStepCopy(step, animate = true) {
  applyStageCopy(
    {
      kicker: "Breaking off",
      title: step.label,
      meta: formatWeeks(getStepCount(step)),
      highlight: true
    },
    animate
  );
}

const SECTION_DOT_MAP = {
  completed: 0,
  remaining: 1,
  sleep: 2,
  work: 3,
  activities: 4,
  "whats-left": 5
};

let currentActiveDot = "completed";

function updateProgressDot(sectionName) {
  if (sectionName === currentActiveDot) {
    return;
  }

  currentActiveDot = sectionName;
  const dots = progressDotsEl.querySelectorAll(".dot");
  const activeIndex = SECTION_DOT_MAP[sectionName] ?? 0;

  dots.forEach((dot, index) => {
    dot.classList.remove("active", "done");

    if (index === activeIndex) {
      dot.classList.add("active");
    } else if (index < activeIndex) {
      dot.classList.add("done");
    }
  });
}

function getScrollProgress(element) {
  if (!element) {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  return Math.max(0, Math.min(1, (viewportHeight - rect.top) / (rect.height + viewportHeight)));
}

function withPreservedAnchor(anchorEl, mutate) {
  const before = anchorEl ? anchorEl.getBoundingClientRect().top : 0;
  const result = mutate();
  const after = anchorEl ? anchorEl.getBoundingClientRect().top : 0;
  const drift = after - before;

  if (Math.abs(drift) > 1) {
    window.scrollBy(0, drift);
  }

  return result;
}

function getStageBoxesForStep(step) {
  return step.categories.flatMap((category) => storyState.stageBoxesByCategory[category] ?? []);
}

function clearFlipStyles(box) {
  box.classList.remove("flip-animating", "breaking-off", "wave-in");
  box.style.transform = "";
  box.style.opacity = "";
  box.style.transition = "";
  box.style.animationDelay = "";
  box.style.removeProperty("--wave-delay");
}

function scheduleUnlock(delay = POST_STEP_LOCK_MS) {
  storyState.lockUntil = Date.now() + delay;
}

function colorizeStep(step) {
  const stepState = storyState.stepStates[step.id];
  if (stepState.colorized) {
    return;
  }

  const boxes = getStageBoxesForStep(step);
  const reducedMotion = isReducedMotion();
  const count = boxes.length;

  boxes.forEach((box, index) => {
    if (!reducedMotion && count > 1) {
      const delay = (index / count) * 0.34;
      box.style.setProperty("--wave-delay", `${delay}s`);
      box.classList.add("wave-in");
    }

    box.classList.remove("neutral");
    box.classList.add(box.dataset.category);
  });

  stepState.colorized = true;
}

function startWhatsLeftEffect() {
  const section = extractedSectionEls["whats-left"];
  section.classList.remove("effect-live", "effect-settled");

  if (storyState.finalEffectTimer) {
    clearTimeout(storyState.finalEffectTimer);
    storyState.finalEffectTimer = null;
  }

  if (isReducedMotion()) {
    section.classList.add("effect-settled");
    return;
  }

  void section.offsetWidth;
  section.classList.add("effect-live");

  storyState.finalEffectTimer = window.setTimeout(() => {
    section.classList.remove("effect-live");
    section.classList.add("effect-settled");
    storyState.finalEffectTimer = null;
  }, FINAL_EFFECT_MS);
}

function revealStepSection(step) {
  const section = extractedSectionEls[step.id];
  if (!section || section.classList.contains("revealed")) {
    return;
  }

  section.classList.add("revealed");

  if (step.effect === "screen") {
    startWhatsLeftEffect();
  }
}

function finishNarrative() {
  if (storyState.narrativeComplete) {
    return;
  }

  storyState.narrativeComplete = true;
  updateProgressDot("whats-left");

  const collapse = () => {
    withPreservedAnchor(sourcesSectionEl, () => {
      stageSectionEl.classList.remove("sticky-stage", "is-live");
      stageSectionEl.classList.add("is-complete");

      spacerEls.forEach((spacer) => spacer.classList.add("collapsed"));
      scrollBufferEl.classList.add("collapsed");
    });
  };

  if (isReducedMotion()) {
    collapse();
    return;
  }

  window.setTimeout(collapse, 180);
}

function finalizeBreakoff(introFutureBoxes, introHeight, animateHeight) {
  const anchorEl = spacerByStep.breakoff || stageSectionEl;

  withPreservedAnchor(anchorEl, () => {
    introFutureBoxes.forEach((box) => box.remove());
    const completedHeight = introGridEl.getBoundingClientRect().height;

    introSectionEl.classList.add("is-peeled");
    introGridEl.style.height = `${introHeight}px`;
    introGridEl.offsetHeight;
    introGridEl.style.height = `${completedHeight}px`;

    stageSectionEl.classList.remove("is-floating", "is-measuring", "is-hidden");
    stageSectionEl.classList.add("is-live", "sticky-stage");
  });

  if (!animateHeight || isReducedMotion()) {
    introGridEl.style.height = "";
  } else {
    window.setTimeout(() => {
      introGridEl.style.height = "";
    }, BREAKOFF_DURATION_MS);
  }

  stageGridEl.querySelectorAll(".week").forEach(clearFlipStyles);
  storyState.introSplit = true;
  storyState.breakoffAnimating = false;
  scheduleUnlock(260);
  applyRemainingCopy(true);
}

function activateRemainingStage() {
  if (!currentModel || storyState.introSplit || storyState.breakoffAnimating || currentModel.futureWeeks === 0) {
    return;
  }

  storyState.breakoffAnimating = true;
  updateProgressDot("remaining");
  applyRemainingCopy(false);

  const introFutureBoxes = Array.from(introGridEl.querySelectorAll('[data-phase="future"]'));
  const introHeight = introGridEl.getBoundingClientRect().height;

  if (introFutureBoxes.length === 0 || isReducedMotion()) {
    stageSectionEl.classList.remove("is-hidden");
    finalizeBreakoff(introFutureBoxes, introHeight, false);
    return;
  }

  stageSectionEl.classList.remove("is-hidden");
  stageSectionEl.classList.add("is-measuring");
  stageSectionEl.getBoundingClientRect();

  const stageBoxes = Array.from(stageGridEl.children);
  const pairs = stageBoxes
    .map((box, index) => {
      const source = introFutureBoxes[index];
      if (!source) {
        return null;
      }

      const sourceRect = source.getBoundingClientRect();
      const targetRect = box.getBoundingClientRect();

      return {
        box,
        dx: sourceRect.left - targetRect.left,
        dy: sourceRect.top - targetRect.top
      };
    })
    .filter(Boolean);

  stageSectionEl.classList.remove("is-measuring");
  stageSectionEl.classList.add("is-floating");
  introGridEl.style.height = `${introHeight}px`;

  pairs.forEach(({ box, dx, dy }) => {
    box.style.transition = "none";
    box.style.transform = `translate(${dx}px, ${dy}px)`;
    box.style.opacity = "0.3";
  });

  stageGridEl.offsetHeight;

  requestAnimationFrame(() => {
    introFutureBoxes.forEach((box) => {
      box.classList.add("leaving-intro");
    });

    pairs.forEach(({ box }) => {
      box.classList.add("flip-animating");
      box.style.transform = "translate(0, 0)";
      box.style.opacity = "1";
    });
  });

  window.setTimeout(() => {
    finalizeBreakoff(introFutureBoxes, introHeight, true);
  }, BREAKOFF_DURATION_MS);
}

function extractStep(step) {
  const stepState = storyState.stepStates[step.id];
  if (stepState.extracting || stepState.extracted) {
    return;
  }

  stepState.extracting = true;
  const reducedMotion = isReducedMotion();
  const boxes = getStageBoxesForStep(step);
  const stageHeight = stageGridEl.getBoundingClientRect().height;
  const staggerSpread = reducedMotion || boxes.length < 2 ? 0 : PEEL_STAGGER_MS;
  const totalDelay = reducedMotion ? 0 : PEEL_DURATION_MS + staggerSpread;

  stageGridEl.style.height = `${stageHeight}px`;

  boxes.forEach((box, index) => {
    if (!reducedMotion && boxes.length > 1) {
      const delay = (index / (boxes.length - 1)) * (PEEL_STAGGER_MS / 1000);
      box.style.animationDelay = `${delay}s`;
    }

    if (!reducedMotion) {
      box.classList.add("breaking-off");
    }
  });

  window.setTimeout(() => {
    const anchorEl = spacerByStep[step.id] || stageSectionEl;

    withPreservedAnchor(anchorEl, () => {
      boxes.forEach((box) => box.remove());
      refreshStageBoxCache();
      revealStepSection(step);

      const nextHeight = stageGridEl.getBoundingClientRect().height;
      stageGridEl.style.height = `${stageHeight}px`;
      stageGridEl.offsetHeight;
      stageGridEl.style.height = `${nextHeight}px`;
    });

    stepState.extracting = false;
    stepState.extracted = true;
    applyRemainingCopy(true);

    window.setTimeout(() => {
      stageGridEl.style.height = "";
    }, reducedMotion ? 0 : PEEL_DURATION_MS);

    if (step.id === "whats-left") {
      scheduleUnlock(0);
      finishNarrative();
      return;
    }

    scheduleUnlock();
  }, totalDelay);
}

function getNextPendingStep() {
  return STORY_STEPS.find((step) => !storyState.stepStates[step.id].extracted) ?? null;
}

function updateScrollCue() {
  if (storyState.scrollCueFaded || currentModel?.futureWeeks === 0) {
    return;
  }

  if (window.scrollY > 80) {
    scrollCueEl.classList.add("fading");
    storyState.scrollCueFaded = true;
  }
}

function updateStoryFromScroll() {
  if (!currentModel || currentModel.futureWeeks === 0 || storyState.narrativeComplete) {
    return;
  }

  if (!storyState.introSplit) {
    const breakoffProgress = getScrollProgress(spacerByStep.breakoff);

    if (breakoffProgress > 0.05) {
      updateProgressDot("remaining");
    }

    if (!storyState.breakoffAnimating && breakoffProgress > BREAKOFF_TRIGGER) {
      activateRemainingStage();
    }

    return;
  }

  if (storyState.breakoffAnimating || Date.now() < storyState.lockUntil) {
    return;
  }

  const step = getNextPendingStep();
  if (!step) {
    updateProgressDot("whats-left");
    return;
  }

  const stepState = storyState.stepStates[step.id];
  const progress = getScrollProgress(spacerByStep[step.id]);

  if (progress > STEP_ENTRY_TRIGGER) {
    applyStepCopy(step, true);
    updateProgressDot(step.id);
  } else {
    applyRemainingCopy(true);
    updateProgressDot("remaining");
  }

  if (progress > STEP_COLOR_TRIGGER && !stepState.colorized) {
    colorizeStep(step);
  }

  if (progress > STEP_EXTRACT_TRIGGER && !stepState.extracting && !stepState.extracted) {
    extractStep(step);
  }
}

function handleScrollFrame() {
  updateScrollCue();
  updateStoryFromScroll();
  scrollTicking = false;
}

function requestScrollFrame() {
  if (scrollTicking) {
    return;
  }

  scrollTicking = true;
  requestAnimationFrame(handleScrollFrame);
}

function initScrollNarrative() {
  if (!currentModel) {
    return;
  }

  if (currentModel.futureWeeks === 0) {
    scrollCueEl.classList.add("hidden");
    progressDotsEl.classList.add("hidden");
    return;
  }

  scrollCueEl.classList.remove("hidden");
  scrollCueEl.classList.add("visible");
  progressDotsEl.classList.remove("hidden");
  progressDotsEl.classList.add("visible");

  if (!scrollBound) {
    window.addEventListener("scroll", requestScrollFrame, { passive: true });
    scrollBound = true;
  }

  requestScrollFrame();
}

function advanceOnboarding() {
  const age = Number.parseFloat(onboardingAgeInput.value);

  if (!Number.isFinite(age) || age < 0 || age > 120) {
    onboardingAgeInput.style.borderColor = "#b34a58";
    return;
  }

  onboardingAgeInput.style.borderColor = "";
  document.querySelector("[data-step='0']").classList.add("hidden");
  document.querySelector("[data-step='1']").classList.remove("hidden");
  onboardingScreenInput.focus();
}

function completeOnboarding() {
  const screen = Number.parseFloat(onboardingScreenInput.value);

  if (!Number.isFinite(screen) || screen < 0 || screen > 24) {
    onboardingScreenInput.style.borderColor = "#b34a58";
    return;
  }

  onboardingScreenInput.style.borderColor = "";
  ageInput.value = onboardingAgeInput.value;
  document.getElementById("screenTime").value = onboardingScreenInput.value;

  const parsed = parseInputs();
  if (parsed.error) {
    validationMessage.textContent = parsed.error;
    return;
  }

  validationMessage.textContent = "";
  renderAll(calculateModel(parsed));

  onboardingEl.classList.add("done");
  visualizationEl.classList.remove("viz-hidden");

  window.setTimeout(() => {
    initScrollNarrative();
  }, 400);
}

onboardingNextBtn.addEventListener("click", advanceOnboarding);
onboardingGoBtn.addEventListener("click", completeOnboarding);

onboardingAgeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    advanceOnboarding();
  }
});

onboardingScreenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    completeOnboarding();
  }
});
