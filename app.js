/* ═══════════════════════════════════════
   Constants & Model
   ═══════════════════════════════════════ */

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

const PROJECTED_ACTIVITY_KEYS = ["eating", "hygiene", "chores", "commute", "errands"];
const REMAINING_AWAKE_KEYS = ["phone", "free"];
const ACTIVITIES_SUBCATEGORIES = ["eating", "hygiene", "chores", "commute", "errands"];
const EXTRACTION_ORDER = ["sleep", "work", "activities"];

/* ═══════════════════════════════════════
   DOM References
   ═══════════════════════════════════════ */

const ageInput = document.getElementById("age");
const lifeExpectancyInput = document.getElementById("lifeExpectancy");
const validationMessage = document.getElementById("validationMessage");

const completedGridEl = document.getElementById("completedWeeksGrid");
const unifiedGridEl = document.getElementById("unifiedWeeksGrid");
const sleepGridEl = document.getElementById("sleepWeeksGrid");
const workGridEl = document.getElementById("workWeeksGrid");
const activitiesGridEl = document.getElementById("activitiesWeeksGrid");
const completedMetaEl = document.getElementById("completedMeta");
const unifiedMetaEl = document.getElementById("unifiedMeta");
const whatsLeftGridEl = document.getElementById("whatsLeftGrid");
const whatsLeftMetaEl = document.getElementById("whatsLeftMeta");
const whatsLeftBreakdownEl = document.getElementById("whatsLeftBreakdown");
const sleepMetaEl = document.getElementById("sleepMeta");
const workMetaEl = document.getElementById("workMeta");
const activitiesMetaEl = document.getElementById("activitiesMeta");

const activityInputs = ACTIVITY_FIELDS.map((field) => ({
  ...field,
  element: document.getElementById(field.inputId)
}));

/* ═══════════════════════════════════════
   Model Functions
   ═══════════════════════════════════════ */

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

function allocateRoundedWeeks(totalWeeks, floatWeeksByKey) {
  const allocations = Object.fromEntries(Object.keys(floatWeeksByKey).map((key) => [key, 0]));
  const entries = Object.entries(floatWeeksByKey).map(([key, weeksFloat]) => {
    const safeFloat = Number.isFinite(weeksFloat) ? Math.max(0, weeksFloat) : 0;
    const floorWeeks = Math.floor(safeFloat);
    allocations[key] = floorWeeks;
    return { key, floorWeeks, remainder: safeFloat - floorWeeks };
  });

  let assigned = entries.reduce((sum, entry) => sum + entry.floorWeeks, 0);
  let delta = totalWeeks - assigned;

  if (delta > 0) {
    const sorted = [...entries].sort((a, b) => b.remainder - a.remainder);
    let i = 0;
    while (delta > 0) {
      allocations[sorted[i % sorted.length].key] += 1;
      delta -= 1;
      i += 1;
    }
  }

  if (delta < 0) {
    const sorted = [...entries].sort((a, b) => a.remainder - b.remainder);
    let i = 0;
    while (delta < 0) {
      if (allocations[sorted[i % sorted.length].key] > 0) {
        allocations[sorted[i % sorted.length].key] -= 1;
        delta += 1;
      }
      i += 1;
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
    sleep: 0, phone: 0, work: 0,
    eating: 0, hygiene: 0, chores: 0,
    commute: 0, errands: 0, free: 0
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

    const clampScale = requestedAwakeHours > awakeHoursPerDay
      ? awakeHoursPerDay / requestedAwakeHours : 1;

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
    ...activityInputs.map((field) => ({
      key: field.key, cssClass: field.cssClass, weeks: roundedWeeks[field.key]
    })),
    { key: "free", cssClass: "free", weeks: roundedWeeks.free }
  ];

  return {
    totalWeeks, livedWeeks, futureWeeks,
    futureSegments,
    segmentWeeks: roundedWeeks
  };
}

/* ═══════════════════════════════════════
   Rendering
   ═══════════════════════════════════════ */

let cachedCategoryBoxes = {};
let currentModel = null;

function renderAll(model) {
  // --- Completed grid ---
  const completedFrag = document.createDocumentFragment();
  for (let w = 0; w < model.livedWeeks; w++) {
    const box = document.createElement("div");
    box.className = "week lived";
    completedFrag.appendChild(box);
  }
  completedGridEl.replaceChildren(completedFrag);
  completedMetaEl.textContent = formatWeeks(model.livedWeeks);

  // --- Unified future grid (all future weeks, neutral color) ---
  const unifiedFrag = document.createDocumentFragment();
  for (const seg of model.futureSegments) {
    for (let w = 0; w < seg.weeks; w++) {
      const box = document.createElement("div");
      box.className = "week neutral";
      box.dataset.category = seg.key;
      unifiedFrag.appendChild(box);
    }
  }
  unifiedGridEl.replaceChildren(unifiedFrag);
  unifiedMetaEl.textContent = formatWeeks(model.futureWeeks);

  // Cache category box references for scroll handler
  cachedCategoryBoxes = {};
  for (const key of ["sleep", "work", ...ACTIVITIES_SUBCATEGORIES, ...REMAINING_AWAKE_KEYS]) {
    cachedCategoryBoxes[key] = unifiedGridEl.querySelectorAll(`[data-category="${key}"]`);
  }

  // --- Extracted section grids (pre-rendered, hidden until scroll) ---
  const sleepFrag = document.createDocumentFragment();
  for (let w = 0; w < model.segmentWeeks.sleep; w++) {
    const box = document.createElement("div");
    box.className = "week sleep";
    sleepFrag.appendChild(box);
  }
  sleepGridEl.replaceChildren(sleepFrag);
  sleepMetaEl.textContent = formatWeeks(model.segmentWeeks.sleep);

  const workFrag = document.createDocumentFragment();
  const workWeeks = model.segmentWeeks.work ?? 0;
  for (let w = 0; w < workWeeks; w++) {
    const box = document.createElement("div");
    box.className = "week work";
    workFrag.appendChild(box);
  }
  workGridEl.replaceChildren(workFrag);
  workMetaEl.textContent = formatWeeks(workWeeks);

  const actFrag = document.createDocumentFragment();
  let actTotal = 0;
  for (const key of PROJECTED_ACTIVITY_KEYS) {
    const weeks = model.segmentWeeks[key] ?? 0;
    actTotal += weeks;
    for (let w = 0; w < weeks; w++) {
      const box = document.createElement("div");
      box.className = `week ${key}`;
      actFrag.appendChild(box);
    }
  }
  activitiesGridEl.replaceChildren(actFrag);
  activitiesMetaEl.textContent = formatWeeks(actTotal);

  // --- What's left grid (pre-rendered, shown at bottom after all extractions) ---
  const wlFrag = document.createDocumentFragment();
  let wlTotal = 0;
  for (const key of REMAINING_AWAKE_KEYS) {
    const weeks = model.segmentWeeks[key] ?? 0;
    wlTotal += weeks;
    for (let w = 0; w < weeks; w++) {
      const box = document.createElement("div");
      box.className = `week ${key}`;
      wlFrag.appendChild(box);
    }
  }
  whatsLeftGridEl.replaceChildren(wlFrag);
  whatsLeftMetaEl.textContent = formatWeeks(wlTotal);

  if (wlTotal > 0) {
    const phoneWeeks = model.segmentWeeks.phone ?? 0;
    const phonePct = Math.round((phoneWeeks / wlTotal) * 100);
    whatsLeftBreakdownEl.textContent = `${phonePct}% screen \u00b7 ${100 - phonePct}% free`;
  }
}

/* ═══════════════════════════════════════
   Scroll Extraction
   ═══════════════════════════════════════ */

const extractionState = {
  sleep: { colorized: false, extracted: false },
  work: { colorized: false, extracted: false },
  activities: { colorized: false, extracted: false }
};

function getScrollProgress(el) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return Math.max(0, Math.min(1, (vh - rect.top) / (rect.height + vh)));
}

function colorizeBoxes(category) {
  if (category === "activities") {
    for (const sub of ACTIVITIES_SUBCATEGORIES) {
      if (cachedCategoryBoxes[sub]) {
        cachedCategoryBoxes[sub].forEach((box) => {
          box.classList.remove("neutral");
          box.classList.add(sub);
        });
      }
    }
  } else {
    if (cachedCategoryBoxes[category]) {
      cachedCategoryBoxes[category].forEach((box) => {
        box.classList.remove("neutral");
        box.classList.add(category);
      });
    }
  }
}

let heightAnimating = false;

function extractBoxes(category) {
  const grid = unifiedGridEl;

  // Determine which subcategory keys to extract
  let keys;
  if (category === "activities") {
    keys = [...ACTIVITIES_SUBCATEGORIES];
  } else {
    keys = [category];
  }

  // If a previous height animation is still running, resolve it immediately
  if (heightAnimating) {
    grid.style.transition = "none";
    grid.style.height = "";
    grid.offsetHeight; // force reflow
    grid.style.transition = "";
  }

  // 1. Lock current grid height
  const currentHeight = grid.getBoundingClientRect().height;
  grid.style.height = currentHeight + "px";

  // 2. Apply break-off animation to all boxes for these keys
  const boxesToRemove = [];
  for (const key of keys) {
    if (cachedCategoryBoxes[key]) {
      cachedCategoryBoxes[key].forEach((box) => {
        box.classList.add("breaking-off");
        boxesToRemove.push(box);
      });
    }
  }

  // 3. After animation completes, remove from DOM and transition height
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animDuration = reducedMotion ? 0 : 500;

  heightAnimating = true;

  setTimeout(() => {
    // Remove boxes from DOM
    for (const box of boxesToRemove) {
      box.remove();
    }

    // Invalidate cached references for removed categories
    for (const key of keys) {
      delete cachedCategoryBoxes[key];
    }

    // Calculate new natural height
    grid.style.height = "auto";
    const newHeight = grid.getBoundingClientRect().height;
    grid.style.height = currentHeight + "px";

    // Force reflow, then set target height
    grid.offsetHeight;

    if (reducedMotion) {
      grid.style.height = newHeight + "px";
      setTimeout(() => {
        grid.style.height = "";
        heightAnimating = false;
        // Update meta label
        unifiedMetaEl.textContent = formatWeeks(grid.children.length);
        checkFinalState();
      }, 50);
    } else {
      grid.style.height = newHeight + "px";

      // Update meta label
      unifiedMetaEl.textContent = formatWeeks(grid.children.length);

      // After height transition completes, remove explicit height
      setTimeout(() => {
        grid.style.height = "";
        heightAnimating = false;
        checkFinalState();
      }, 650);
    }
  }, animDuration + 50);
}

function checkFinalState() {
  const allDone = EXTRACTION_ORDER.every((cat) => extractionState[cat].extracted);
  if (!allDone) return;

  const unifiedSection = document.getElementById("section-unified");

  // Collapse the sticky unified grid (fades out + shrinks via CSS)
  unifiedSection.classList.remove("sticky-shelf");
  unifiedSection.classList.add("final-state");

  // Collapse scroll spacers (no longer needed)
  document.querySelectorAll(".scroll-spacer").forEach((spacer) => {
    spacer.style.height = "0";
  });

  // Reveal the bottom "What's left" section
  const whatsLeftSection = document.getElementById("section-whats-left");
  if (whatsLeftSection) whatsLeftSection.classList.add("extracted");
}

let stickyActivated = false;

function updateExtractions() {
  const spacers = document.querySelectorAll(".scroll-spacer");

  // Activate sticky once user reaches the first spacer
  if (!stickyActivated) {
    const firstSpacer = spacers[0];
    if (firstSpacer) {
      const progress = getScrollProgress(firstSpacer);
      if (progress > 0.05) {
        stickyActivated = true;
        document.getElementById("section-unified").classList.add("sticky-shelf");
      }
    }
  }

  spacers.forEach((spacer) => {
    const category = spacer.dataset.extract;
    const state = extractionState[category];
    if (!state) return;

    const progress = getScrollProgress(spacer);

    if (progress > 0.15 && !state.colorized) {
      state.colorized = true;
      colorizeBoxes(category);
    }

    if (progress > 0.5 && !state.extracted) {
      state.extracted = true;
      extractBoxes(category);

      const section = document.getElementById(`section-${category}`);
      if (section) section.classList.add("extracted");
    }
  });
}

function initScrollExtraction() {
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateExtractions();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ═══════════════════════════════════════
   Onboarding
   ═══════════════════════════════════════ */

const onboardingEl = document.getElementById("onboarding");
const onboardingAgeInput = document.getElementById("onboarding-age");
const onboardingScreenInput = document.getElementById("onboarding-screen");
const onboardingNextBtn = document.getElementById("onboarding-next");
const onboardingGoBtn = document.getElementById("onboarding-go");
const visualizationEl = document.getElementById("visualization");

function advanceOnboarding() {
  const age = parseFloat(onboardingAgeInput.value);
  if (!isFinite(age) || age < 0 || age > 120) {
    onboardingAgeInput.style.borderColor = "#b34a58";
    return;
  }
  onboardingAgeInput.style.borderColor = "";
  document.querySelector("[data-step='0']").classList.add("hidden");
  document.querySelector("[data-step='1']").classList.remove("hidden");
  onboardingScreenInput.focus();
}

function completeOnboarding() {
  const screen = parseFloat(onboardingScreenInput.value);
  if (!isFinite(screen) || screen < 0 || screen > 24) {
    onboardingScreenInput.style.borderColor = "#b34a58";
    return;
  }
  onboardingScreenInput.style.borderColor = "";

  // Transfer values to hidden inputs
  ageInput.value = onboardingAgeInput.value;
  document.getElementById("screenTime").value = onboardingScreenInput.value;

  // Calculate and render
  const parsed = parseInputs();
  if (parsed.error) return;

  const model = calculateModel(parsed);
  currentModel = model;
  renderAll(model);

  // Transition: fade out onboarding, fade in visualization
  onboardingEl.classList.add("done");
  visualizationEl.classList.remove("viz-hidden");

  // Start scroll extraction after transition
  setTimeout(() => {
    initScrollExtraction();
  }, 400);
}

onboardingNextBtn.addEventListener("click", advanceOnboarding);
onboardingGoBtn.addEventListener("click", completeOnboarding);

onboardingAgeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    advanceOnboarding();
  }
});

onboardingScreenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    completeOnboarding();
  }
});
