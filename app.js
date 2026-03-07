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
const whatsLeftGridEl = document.getElementById("whatsLeftGrid");

const completedMetaEl = document.getElementById("completedMeta");
const unifiedMetaEl = document.getElementById("unifiedMeta");
const sleepMetaEl = document.getElementById("sleepMeta");
const workMetaEl = document.getElementById("workMeta");
const activitiesMetaEl = document.getElementById("activitiesMeta");
const whatsLeftMetaEl = document.getElementById("whatsLeftMeta");
const whatsLeftBreakdownEl = document.getElementById("whatsLeftBreakdown");

const extractionGhostsEl = document.getElementById("extractionGhosts");
const scrollCueEl = document.getElementById("scrollCue");
const progressDotsEl = document.getElementById("progressDots");

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

  // Order segments so extraction categories sit at the TOP of the unified grid.
  // Each extraction peels from the top downward, leaving phone + free at the bottom.
  const futureSegments = [
    { key: "sleep", cssClass: "sleep", weeks: roundedWeeks.sleep },
    { key: "work", cssClass: "work", weeks: roundedWeeks.work },
    ...ACTIVITIES_SUBCATEGORIES.map((key) => ({
      key, cssClass: key, weeks: roundedWeeks[key]
    })),
    { key: "phone", cssClass: "phone", weeks: roundedWeeks.phone },
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

  // --- Extraction result grids (pre-rendered, hidden until checkFinalState) ---
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

  // --- What's left grid ---
  const wlFrag = document.createDocumentFragment();
  let wlTotal = 0;
  for (const key of REMAINING_AWAKE_KEYS) {
    const weeks = model.segmentWeeks[key] ?? 0;
    wlTotal += weeks;
    for (let w = 0; w < weeks; w++) {
      const box = document.createElement("div");
      box.className = `week ${key}`;
      if (key === "phone") {
        box.classList.add("screen-glow");
      }
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
  sleep: { colorized: false, extracting: false, extracted: false },
  work: { colorized: false, extracting: false, extracted: false },
  activities: { colorized: false, extracting: false, extracted: false }
};

function getScrollProgress(el) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return Math.max(0, Math.min(1, (vh - rect.top) / (rect.height + vh)));
}

/* Wave colorization: apply color class with staggered CSS delay */
function colorizeBoxesWave(category) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let boxes;

  if (category === "activities") {
    boxes = [];
    for (const sub of ACTIVITIES_SUBCATEGORIES) {
      if (cachedCategoryBoxes[sub]) {
        cachedCategoryBoxes[sub].forEach((box) => boxes.push({ box, cls: sub }));
      }
    }
  } else {
    boxes = [];
    if (cachedCategoryBoxes[category]) {
      cachedCategoryBoxes[category].forEach((box) => boxes.push({ box, cls: category }));
    }
  }

  // Max wave duration: 600ms spread across all boxes
  const maxDelay = reducedMotion ? 0 : 0.6;
  const count = boxes.length;

  boxes.forEach(({ box, cls }, i) => {
    if (!reducedMotion && count > 1) {
      const delay = (i / count) * maxDelay;
      box.style.setProperty("--wave-delay", delay + "s");
      box.classList.add("wave-in");
    }
    box.classList.remove("neutral");
    box.classList.add(cls);
  });

  // NOTE: phone + free boxes intentionally stay neutral during extraction.
  // They are revealed only in the final "What's Left" section.
}

/* Ghost label: floats up briefly when a category is extracted */
function createGhostLabel(name, weekCount) {
  const ghost = document.createElement("div");
  ghost.className = "ghost-label";
  ghost.innerHTML = `<span>${name} \u00b7 ${formatWeeks(weekCount)}</span>`;
  extractionGhostsEl.appendChild(ghost);
  ghost.addEventListener("animationend", () => ghost.remove());
}

let heightAnimating = false;

function extractBoxes(category) {
  const grid = unifiedGridEl;
  const state = extractionState[category];

  let keys;
  if (category === "activities") {
    keys = [...ACTIVITIES_SUBCATEGORIES];
  } else {
    keys = [category];
  }

  if (heightAnimating) {
    grid.style.transition = "none";
    grid.style.height = "";
    grid.offsetHeight;
    grid.style.transition = "";
  }

  const currentHeight = grid.getBoundingClientRect().height;
  grid.style.height = currentHeight + "px";

  // Allow overflow so boxes can float upward visually during breakOff
  grid.style.overflow = "visible";

  const boxesToRemove = [];
  for (const key of keys) {
    if (cachedCategoryBoxes[key]) {
      cachedCategoryBoxes[key].forEach((box) => {
        boxesToRemove.push(box);
      });
    }
  }

  // Stagger the breakOff animation for a cascading dissolve (top-left first)
  const totalBoxes = boxesToRemove.length;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const staggerDuration = reducedMotion ? 0 : 0.3; // 300ms spread

  boxesToRemove.forEach((box, i) => {
    if (!reducedMotion && totalBoxes > 1) {
      const delay = (i / (totalBoxes - 1)) * staggerDuration;
      box.style.animationDelay = delay + "s";
    }
    box.classList.add("breaking-off");
  });

  // Create ghost label showing what was removed
  const categoryNames = { sleep: "Sleep", work: "Work", activities: "Activities" };
  createGhostLabel(categoryNames[category], totalBoxes);

  const animDuration = reducedMotion ? 0 : 600;
  const totalAnimTime = animDuration + staggerDuration * 1000;

  heightAnimating = true;

  function finishExtraction() {
    state.extracted = true;
    state.extracting = false;
    heightAnimating = false;

    // Cooldown: give the next prompt 1.5s to display before next extraction can fire
    extractionCooldownUntil = Date.now() + 1500;

    checkFinalState();
  }

  setTimeout(() => {
    for (const box of boxesToRemove) {
      box.remove();
    }

    for (const key of keys) {
      delete cachedCategoryBoxes[key];
    }

    // Clip overflow for height shrink animation
    grid.style.overflow = "hidden";

    grid.style.height = "auto";
    const newHeight = grid.getBoundingClientRect().height;
    grid.style.height = currentHeight + "px";

    grid.offsetHeight;

    if (reducedMotion) {
      grid.style.height = newHeight + "px";
      setTimeout(() => {
        grid.style.height = "";
        grid.style.overflow = "";
        unifiedMetaEl.textContent = formatWeeks(grid.children.length);
        finishExtraction();
      }, 50);
    } else {
      grid.style.height = newHeight + "px";
      unifiedMetaEl.textContent = formatWeeks(grid.children.length);

      setTimeout(() => {
        grid.style.height = "";
        grid.style.overflow = "";
        finishExtraction();
      }, 650);
    }
  }, totalAnimTime + 50);
}

function checkFinalState() {
  const allDone = EXTRACTION_ORDER.every((cat) => extractionState[cat].extracted);
  if (!allDone) return;

  const unifiedSection = document.getElementById("section-unified");

  // Anchor scroll position before layout changes
  const completedSection = document.getElementById("section-completed");
  const anchorRect = completedSection.getBoundingClientRect();

  // Remove sticky positioning and release locked height
  unifiedSection.classList.remove("sticky-shelf");
  unifiedSection.style.minHeight = "";

  // Hide unified grid section
  unifiedSection.classList.add("final-state");

  // Collapse all spacers and scroll buffer now that the narrative is complete
  document.querySelectorAll(".scroll-spacer, .scroll-buffer").forEach((el) => {
    el.classList.add("collapsed");
  });

  // Restore scroll position so the user doesn't jump
  const newAnchorRect = completedSection.getBoundingClientRect();
  const drift = newAnchorRect.top - anchorRect.top;
  if (Math.abs(drift) > 1) {
    window.scrollBy(0, drift);
  }

  // Reveal extraction result sections with staggered timing
  const revealIds = ["section-sleep", "section-work", "section-activities", "section-whats-left"];
  revealIds.forEach((id, i) => {
    setTimeout(() => {
      document.getElementById(id).classList.add("revealed");
    }, i * 150);
  });

  // Clean up: stop cooldown polling since all extractions are done
  if (cooldownCheckInterval) {
    clearInterval(cooldownCheckInterval);
    cooldownCheckInterval = null;
  }

  // Update progress dots
  updateProgressDot("whats-left");
}

/* ═══════════════════════════════════════
   Progress Dots
   ═══════════════════════════════════════ */

const SECTION_DOT_MAP = {
  "completed": 0,
  "remaining": 1,
  "sleep": 2,
  "work": 3,
  "activities": 4,
  "whats-left": 5
};

let currentActiveDot = "completed";

function updateProgressDot(sectionName) {
  if (sectionName === currentActiveDot) return;
  currentActiveDot = sectionName;

  const dots = progressDotsEl.querySelectorAll(".dot");
  const activeIdx = SECTION_DOT_MAP[sectionName] ?? 0;

  dots.forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i === activeIdx) {
      dot.classList.add("active");
    } else if (i < activeIdx) {
      dot.classList.add("done");
    }
  });
}

/* ═══════════════════════════════════════
   Spacer Prompt Animations
   ═══════════════════════════════════════ */

function getNextPendingIndex() {
  // Find the next extraction that hasn't started yet (ignoring cooldown)
  for (let i = 0; i < EXTRACTION_ORDER.length; i++) {
    const state = extractionState[EXTRACTION_ORDER[i]];
    if (!state.extracting && !state.extracted) return i;
  }
  return EXTRACTION_ORDER.length;
}

function updateSpacerPrompts() {
  // Show prompt for the next pending extraction (even during cooldown)
  const nextIdx = getNextPendingIndex();
  const spacers = document.querySelectorAll(".scroll-spacer");

  spacers.forEach((spacer) => {
    const prompt = spacer.querySelector(".spacer-prompt");
    if (!prompt) return;

    const category = spacer.dataset.extract;
    const catIdx = EXTRACTION_ORDER.indexOf(category);
    const state = extractionState[category];

    if (catIdx === nextIdx) {
      // This is the next prompt to show
      prompt.classList.add("visible");
      prompt.classList.remove("fading");
    } else if (state?.extracting || state?.extracted) {
      prompt.classList.remove("visible");
      prompt.classList.add("fading");
    } else {
      prompt.classList.remove("visible", "fading");
    }
  });
}

/* ═══════════════════════════════════════
   Scroll Cue
   ═══════════════════════════════════════ */

let scrollCueFaded = false;

function updateScrollCue() {
  if (scrollCueFaded) return;

  // Fade scroll cue after user starts scrolling
  if (window.scrollY > 80) {
    scrollCueEl.classList.add("fading");
    scrollCueFaded = true;
  }
}

/* ═══════════════════════════════════════
   Main Scroll Handler
   ═══════════════════════════════════════ */

let stickyActivated = false;
let extractionCooldownUntil = 0;
let cooldownCheckInterval = null;

function getActiveExtractionIndex() {
  // Enforce cooldown between extractions so prompts have time to display
  if (Date.now() < extractionCooldownUntil) return -1; // locked

  for (let i = 0; i < EXTRACTION_ORDER.length; i++) {
    const state = extractionState[EXTRACTION_ORDER[i]];
    if (state.extracting || !state.extracted) return i;
  }
  return EXTRACTION_ORDER.length; // all done
}

function updateExtractions() {
  const spacers = document.querySelectorAll(".scroll-spacer");

  // Activate sticky once user reaches the first spacer
  if (!stickyActivated) {
    const firstSpacer = spacers[0];
    if (firstSpacer) {
      const progress = getScrollProgress(firstSpacer);
      if (progress > 0.05) {
        stickyActivated = true;
        const unifiedSection = document.getElementById("section-unified");
        unifiedSection.classList.add("sticky-shelf");
        // Lock section height so grid shrinkage during extractions doesn't steal scroll room
        unifiedSection.style.minHeight = unifiedSection.getBoundingClientRect().height + "px";
      }
    }
  }

  // Sequential gating: only process the NEXT extraction in order
  const activeIdx = getActiveExtractionIndex();
  let deepestSection = "completed";

  spacers.forEach((spacer, i) => {
    const category = spacer.dataset.extract;
    const state = extractionState[category];
    if (!state) return;

    const catIdx = EXTRACTION_ORDER.indexOf(category);
    const progress = getScrollProgress(spacer);

    // Only process the currently active extraction (sequential gating, -1 = cooldown locked)
    if (activeIdx >= 0 && catIdx === activeIdx && !state.extracting) {
      // Colorize at 20% progress
      if (progress > 0.2 && !state.colorized) {
        state.colorized = true;
        colorizeBoxesWave(category);
      }

      // Extract at 55% progress
      if (progress > 0.55 && !state.extracted) {
        state.extracting = true;
        extractBoxes(category);

        // Fade out the narrative prompt
        const prompt = spacer.querySelector(".spacer-prompt");
        if (prompt) {
          prompt.classList.remove("visible");
          prompt.classList.add("fading");
        }
      }
    }

    // Update deepest visible section for progress dots
    if (state.extracted) {
      deepestSection = category;
    } else if (catIdx === activeIdx && progress > 0.1) {
      deepestSection = "remaining";
    }
  });

  updateProgressDot(deepestSection);
}

function initScrollExtraction() {
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateExtractions();
      updateSpacerPrompts();
      updateScrollCue();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // Periodic check to handle cooldown expiry (user may not be scrolling)
  cooldownCheckInterval = setInterval(() => {
    if (extractionCooldownUntil > 0 && Date.now() >= extractionCooldownUntil) {
      onScroll();
    }
  }, 200);

  // Show scroll cue and progress dots
  scrollCueEl.classList.add("visible");
  progressDotsEl.classList.remove("hidden");
  progressDotsEl.classList.add("visible");

  // Initial check
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
