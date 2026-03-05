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

const controls = document.getElementById("controls");
const ageInput = document.getElementById("age");
const screenTimeInput = document.getElementById("screenTime");
const lifeExpectancyInput = document.getElementById("lifeExpectancy");
const validationMessage = document.getElementById("validationMessage");
const summaryEl = document.getElementById("summary");
const gridEl = document.getElementById("weeksGrid");

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

function parseInputs() {
  const age = Number.parseFloat(ageInput.value);
  const screenTime = Number.parseFloat(screenTimeInput.value);
  const lifeExpectancy = Number.parseFloat(lifeExpectancyInput.value);

  if (!Number.isFinite(age) || age < 0 || age > 120) {
    return { error: "Enter an age between 0 and 120." };
  }

  if (!Number.isFinite(screenTime) || screenTime < 0 || screenTime > 24) {
    return { error: "Enter daily screen time between 0 and 24 hours." };
  }

  if (!Number.isFinite(lifeExpectancy) || lifeExpectancy <= 0 || lifeExpectancy > 120) {
    return { error: "Enter life expectancy between 1 and 120 years." };
  }

  if (age > lifeExpectancy) {
    return { error: "Age cannot be greater than life expectancy." };
  }

  return { age, screenTime, lifeExpectancy };
}

function calculateModel({ age, screenTime, lifeExpectancy }) {
  const totalWeeks = Math.round(lifeExpectancy * WEEKS_PER_YEAR);
  const livedWeeks = Math.round(age * WEEKS_PER_YEAR);
  const futureWeeks = Math.max(0, totalWeeks - livedWeeks);

  let futureSleepWeeksFloat = 0;
  let futurePhoneWeeksFloat = 0;

  for (let week = 0; week < futureWeeks; week += 1) {
    const ageThisWeek = age + week / WEEKS_PER_YEAR;
    const sleepHoursPerDay = getSleepHoursForAge(ageThisWeek);
    const availableAwakeHours = Math.max(0, 24 - sleepHoursPerDay);
    const clampedScreenTime = Math.min(screenTime, availableAwakeHours);

    futureSleepWeeksFloat += sleepHoursPerDay / 24;
    futurePhoneWeeksFloat += clampedScreenTime / 24;
  }

  const sleepWeeks = Math.min(futureWeeks, Math.round(futureSleepWeeksFloat));
  const phoneWeeks = Math.min(futureWeeks - sleepWeeks, Math.round(futurePhoneWeeksFloat));
  const freeWeeks = Math.max(0, futureWeeks - sleepWeeks - phoneWeeks);

  const lifetimePhoneWeeks = Math.round(totalWeeks * (screenTime / 24));

  return {
    totalWeeks,
    livedWeeks,
    futureWeeks,
    sleepWeeks,
    phoneWeeks,
    freeWeeks,
    lifetimePhoneWeeks
  };
}

function renderSummary(model) {
  const stats = [
    { label: "Weeks lived", value: `${formatWeeks(model.livedWeeks)} (${formatYears(model.livedWeeks)})` },
    {
      label: "Projected future sleep",
      value: `${formatWeeks(model.sleepWeeks)} (${formatYears(model.sleepWeeks)})`
    },
    {
      label: "Projected future phone time",
      value: `${formatWeeks(model.phoneWeeks)} (${formatYears(model.phoneWeeks)})`
    },
    { label: "Other future time", value: `${formatWeeks(model.freeWeeks)} (${formatYears(model.freeWeeks)})` },
    {
      label: "Phone time over full life (at current average)",
      value: `${formatWeeks(model.lifetimePhoneWeeks)} (${formatYears(model.lifetimePhoneWeeks)})`
    }
  ];

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
  const fragment = document.createDocumentFragment();

  const livedCutoff = model.livedWeeks;
  const sleepCutoff = livedCutoff + model.sleepWeeks;
  const phoneCutoff = sleepCutoff + model.phoneWeeks;

  for (let weekIndex = 0; weekIndex < model.totalWeeks; weekIndex += 1) {
    const box = document.createElement("div");
    box.className = "week";

    if (weekIndex < livedCutoff) {
      box.classList.add("lived");
      box.title = `Week ${weekIndex + 1}: lived`;
    } else if (weekIndex < sleepCutoff) {
      box.classList.add("sleep");
      box.title = `Week ${weekIndex + 1}: projected sleep`;
    } else if (weekIndex < phoneCutoff) {
      box.classList.add("phone");
      box.title = `Week ${weekIndex + 1}: projected phone time`;
    } else {
      box.title = `Week ${weekIndex + 1}: other future time`;
    }

    fragment.appendChild(box);
  }

  gridEl.replaceChildren(fragment);
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

[ageInput, screenTimeInput, lifeExpectancyInput].forEach((input) => {
  input.addEventListener("input", () => {
    updateVisualization();
  });
});

updateVisualization();
