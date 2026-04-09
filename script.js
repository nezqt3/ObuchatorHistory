const STORAGE_KEY = "history-memory-trainer/v1";
const DEFAULT_DATASET_ID = "important";

const state = {
  datasets: [],
  cards: [],
  progress: loadProgress(),
  currentCard: null,
  currentChoices: [],
  currentResult: null,
  answered: false,
  revealed: false,
  selectedChoice: null,
  feedbackText: "",
  recentIds: [],
  dueRepeats: [],
  settings: {
    mode: "flash",
    dataset: DEFAULT_DATASET_ID,
  },
  session: createSessionState(),
};

const elements = {
  totalCardsBadge: document.querySelector("#total-cards-badge"),
  masteryBadge: document.querySelector("#mastery-badge"),
  focusBadge: document.querySelector("#focus-badge"),
  questionIndex: document.querySelector("#question-index"),
  promptText: document.querySelector("#prompt-text"),
  promptHelper: document.querySelector("#prompt-helper"),
  answerDisplay: document.querySelector("#answer-display"),
  answerValue: document.querySelector("#answer-value"),
  revealAnswer: document.querySelector("#reveal-answer"),
  responseActions: document.querySelector("#response-actions"),
  knowAnswer: document.querySelector("#know-answer"),
  repeatAnswer: document.querySelector("#repeat-answer"),
  choicesGrid: document.querySelector("#choices-grid"),
  typeForm: document.querySelector("#type-form"),
  typedAnswer: document.querySelector("#typed-answer"),
  cantRemember: document.querySelector("#cant-remember"),
  feedback: document.querySelector("#feedback"),
  nextCard: document.querySelector("#next-card"),
  modeSwitch: document.querySelector("#mode-switch"),
  datasetSwitch: document.querySelector("#dataset-switch"),
  datasetNote: document.querySelector("#dataset-note"),
  resetProgress: document.querySelector("#reset-progress"),
  sessionReviewed: document.querySelector("#session-reviewed"),
  sessionStreak: document.querySelector("#session-streak"),
  correctCount: document.querySelector("#correct-count"),
  wrongCount: document.querySelector("#wrong-count"),
  bestStreak: document.querySelector("#best-streak"),
  strongCards: document.querySelector("#strong-cards"),
  masteryBarFill: document.querySelector("#mastery-bar-fill"),
  challengeList: document.querySelector("#challenge-list"),
};

boot();

async function boot() {
  state.datasets = getDatasets();

  if (state.progress.settings?.mode) {
    state.settings.mode = state.progress.settings.mode;
  }

  if (
    state.progress.settings?.dataset &&
    state.datasets.some((dataset) => dataset.id === state.progress.settings.dataset)
  ) {
    state.settings.dataset = state.progress.settings.dataset;
  }

  bindEvents();
  renderModeButtons();
  renderDatasetButtons();
  await applyDataset(state.settings.dataset, { resetSession: false });
}

function createSessionState() {
  return {
    reviewed: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
  };
}

function getDatasets() {
  if (Array.isArray(window.HISTORY_DATASETS) && window.HISTORY_DATASETS.length) {
    return window.HISTORY_DATASETS.map((dataset) => ({
      ...dataset,
      file: dataset.file || "./history.txt",
    }));
  }

  return [
    {
      id: "all",
      label: "Все даты",
      description: "основной список",
      hint: "Если внешний конфиг не загрузился, тренажёр возьмёт стандартный файл history.txt.",
      file: "./history.txt",
    },
  ];
}

function getDatasetById(datasetId) {
  return state.datasets.find((dataset) => dataset.id === datasetId) || null;
}

async function applyDataset(datasetId, { resetSession = true } = {}) {
  const dataset = getDatasetById(datasetId);
  if (!dataset) {
    return;
  }

  const rawText = await getDatasetText(dataset);

  state.settings.dataset = dataset.id;
  state.cards = parseCards(dataset.id, rawText);
  state.currentCard = null;
  state.currentChoices = [];
  state.currentResult = null;
  state.answered = false;
  state.revealed = false;
  state.selectedChoice = null;
  state.feedbackText = "";
  state.recentIds = [];
  state.dueRepeats = [];

  if (resetSession) {
    state.session = createSessionState();
  }

  state.progress.settings = {
    ...state.progress.settings,
    mode: state.settings.mode,
    dataset: state.settings.dataset,
  };

  renderDatasetButtons();

  if (!state.cards.length) {
    saveProgress();
    renderTrainer();
    updateStats();
    return;
  }

  nextCard();
  saveProgress();
}

async function getDatasetText(dataset) {
  if (typeof dataset.source === "string" && dataset.source.trim()) {
    return dataset.source;
  }

  try {
    const response = await fetch(dataset.file);
    if (!response.ok) {
      throw new Error(`source file missing: ${dataset.file}`);
    }

    return await response.text();
  } catch (error) {
    console.error(error);
    return "";
  }
}

function parseCards(datasetId, text) {
  const normalized = text
    .replace(/\u2028/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split("\n")
    .map((line, index) => {
      const parts = line.match(/^(.*)\s+—\s+(.*)$/);
      if (!parts) {
        return null;
      }

      const date = parts[1].trim();
      const event = parts[2].trim();
      return {
        id: `${datasetId}-card-${index + 1}`,
        date,
        event,
      };
    })
    .filter(Boolean);
}

function bindEvents() {
  elements.datasetSwitch.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-dataset]");
    if (!button || button.dataset.dataset === state.settings.dataset) {
      return;
    }

    await applyDataset(button.dataset.dataset);
  });

  elements.modeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) {
      return;
    }

    state.settings.mode = button.dataset.mode;
    state.progress.settings = {
      ...state.progress.settings,
      mode: state.settings.mode,
      dataset: state.settings.dataset,
    };
    saveProgress();
    renderModeButtons();
    nextCard();
  });

  elements.revealAnswer.addEventListener("click", () => {
    if (!state.currentCard) {
      return;
    }

    state.revealed = true;
    renderTrainer();
  });

  elements.knowAnswer.addEventListener("click", () => {
    submitResult(true);
  });

  elements.repeatAnswer.addEventListener("click", () => {
    submitResult(false);
  });

  elements.typeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.currentCard || state.answered) {
      return;
    }

    const userAnswer = normalizeAnswer(elements.typedAnswer.value);
    const expectedAnswer = normalizeAnswer(state.currentCard.date);
    submitResult(userAnswer === expectedAnswer);
  });

  elements.cantRemember.addEventListener("click", () => {
    if (!state.currentCard || state.answered) {
      return;
    }

    submitResult(false);
  });

  elements.nextCard.addEventListener("click", () => {
    nextCard();
  });

  elements.resetProgress.addEventListener("click", () => {
    const shouldReset = window.confirm(
      "Сбросить весь сохранённый прогресс по датам? Это действие нельзя отменить.",
    );

    if (!shouldReset) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    state.progress = loadProgress();
    state.progress.settings = {
      mode: state.settings.mode,
      dataset: state.settings.dataset,
    };
    state.session = createSessionState();
    state.dueRepeats = [];
    state.recentIds = [];
    saveProgress();
    nextCard();
    updateStats();
  });

  document.addEventListener("keydown", (event) => {
    const isTyping = document.activeElement === elements.typedAnswer;
    if (isTyping && event.key !== "Escape") {
      return;
    }

    if (event.key === "Enter" && !elements.nextCard.hidden) {
      event.preventDefault();
      nextCard();
      return;
    }

    if (state.settings.mode === "flash") {
      if (!state.revealed && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        elements.revealAnswer.click();
      } else if (state.revealed && !state.answered && event.key === "1") {
        elements.knowAnswer.click();
      } else if (state.revealed && !state.answered && event.key === "2") {
        elements.repeatAnswer.click();
      }
      return;
    }

    if (state.settings.mode === "choice" && !state.answered) {
      const numericChoice = Number(event.key);
      if (numericChoice >= 1 && numericChoice <= state.currentChoices.length) {
        const choiceButton = elements.choicesGrid.querySelector(
          `[data-choice-index="${numericChoice - 1}"]`,
        );
        choiceButton?.click();
      }
    }
  });
}

function renderDatasetButtons() {
  const activeDataset = getDatasetById(state.settings.dataset) || state.datasets[0];

  elements.datasetSwitch.innerHTML = "";

  state.datasets.forEach((dataset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dataset-button";
    button.dataset.dataset = dataset.id;

    if (dataset.id === state.settings.dataset) {
      button.classList.add("active");
    }

    const title = document.createElement("strong");
    title.textContent = dataset.label;

    const description = document.createElement("span");
    description.textContent = dataset.description;

    button.append(title, description);
    elements.datasetSwitch.append(button);
  });

  elements.datasetNote.textContent = activeDataset?.hint || "";
}

function renderModeButtons() {
  const buttons = elements.modeSwitch.querySelectorAll("[data-mode]");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.settings.mode);
  });
}

function nextCard() {
  state.currentCard = pickNextCard();
  state.currentChoices =
    state.settings.mode === "choice" && state.currentCard ? buildChoices(state.currentCard) : [];
  state.currentResult = null;
  state.answered = false;
  state.revealed = false;
  state.selectedChoice = null;
  state.feedbackText = "";

  if (state.settings.mode === "type") {
    elements.typedAnswer.value = "";
  }

  if (state.currentCard) {
    pushRecent(state.currentCard.id);
  }

  renderTrainer();
  updateStats();
}

function pickNextCard() {
  if (!state.cards.length) {
    return null;
  }

  const readyRepeatIndex = state.dueRepeats.findIndex(
    (item) => item.readyAt <= state.session.reviewed,
  );

  if (readyRepeatIndex >= 0) {
    const [repeatItem] = state.dueRepeats.splice(readyRepeatIndex, 1);
    const repeatCard = state.cards.find((card) => card.id === repeatItem.id);
    if (repeatCard) {
      return repeatCard;
    }
  }

  const weightedPool = state.cards.map((card) => ({
    card,
    weight: getCardWeight(card),
  }));

  const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
  let randomPoint = Math.random() * totalWeight;

  for (const item of weightedPool) {
    randomPoint -= item.weight;
    if (randomPoint <= 0) {
      return item.card;
    }
  }

  return weightedPool[weightedPool.length - 1].card;
}

function getCardWeight(card) {
  const stats = getCardStats(card.id);
  let weight = 1;

  weight += stats.wrong * 1.8;
  weight += Math.max(0, 4 - stats.streak) * 0.9;

  if (stats.seen === 0) {
    weight += 2.2;
  }

  if (state.recentIds.includes(card.id)) {
    weight *= 0.18;
  }

  return weight;
}

function buildChoices(card) {
  const otherDates = shuffleArray(
    state.cards
      .filter((item) => item.id !== card.id)
      .map((item) => item.date),
  )
    .filter((date, index, array) => array.indexOf(date) === index)
    .slice(0, 3);

  return shuffleArray([card.date, ...otherDates]);
}

function submitResult(isCorrect, selectedChoice = null) {
  if (!state.currentCard || state.answered) {
    return;
  }

  state.answered = true;
  state.revealed = true;
  state.currentResult = isCorrect ? "success" : "error";
  state.selectedChoice = selectedChoice;

  const stats = getCardStats(state.currentCard.id);
  stats.seen += 1;
  stats.lastSeenAt = Date.now();

  if (isCorrect) {
    stats.correct += 1;
    stats.streak += 1;
    state.session.correct += 1;
    state.session.streak += 1;
    state.feedbackText = "Верно. Карточка уйдёт подальше и вернётся позже.";
  } else {
    stats.wrong += 1;
    stats.streak = 0;
    state.session.wrong += 1;
    state.session.streak = 0;
    queueRepeat(state.currentCard.id);
    state.feedbackText = `Правильный ответ: ${state.currentCard.date}`;
  }

  state.session.reviewed += 1;
  state.session.bestStreak = Math.max(state.session.bestStreak, state.session.streak);
  state.progress.cards[state.currentCard.id] = stats;
  state.progress.settings = {
    ...state.progress.settings,
    mode: state.settings.mode,
    dataset: state.settings.dataset,
  };
  saveProgress();

  renderTrainer();
  updateStats();
}

function queueRepeat(cardId) {
  const existing = state.dueRepeats.find((item) => item.id === cardId);
  const readyAt = state.session.reviewed + 2;

  if (existing) {
    existing.readyAt = Math.min(existing.readyAt, readyAt);
    return;
  }

  state.dueRepeats.push({ id: cardId, readyAt });
}

function renderTrainer() {
  if (!state.currentCard) {
    elements.questionIndex.textContent = "Карточки недоступны";
    elements.promptText.textContent = "Не получилось загрузить выбранный набор дат";
    elements.promptHelper.textContent =
      "Проверь файлы history-all.txt и history-important.txt рядом с index.html.";
    elements.answerValue.textContent = "";
    elements.answerDisplay.hidden = true;
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
    elements.nextCard.hidden = true;
    elements.revealAnswer.hidden = true;
    elements.responseActions.hidden = true;
    elements.choicesGrid.hidden = true;
    elements.choicesGrid.innerHTML = "";
    elements.typeForm.hidden = true;
    return;
  }

  elements.questionIndex.textContent = ordinalLabel(state.session.reviewed + 1);
  elements.promptText.textContent = state.currentCard.event;
  elements.answerValue.textContent = state.currentCard.date;
  elements.answerDisplay.hidden = !state.revealed;
  elements.feedback.textContent = state.feedbackText || "";
  elements.feedback.className = `feedback${state.currentResult ? ` ${state.currentResult}` : ""}`;
  elements.nextCard.hidden = !state.answered;

  const helperText = {
    flash:
      "Сначала попробуй вспомнить дату сам, потом открой ответ и отметь, насколько уверенно знаешь.",
    choice: "Выбери правильную дату из четырёх вариантов. Ошибки быстро вернутся в повторение.",
    type: "Введи дату вручную так, как она записана в списке. Дефис и тире можно писать по-разному.",
  };

  elements.promptHelper.textContent = helperText[state.settings.mode];

  elements.revealAnswer.hidden = state.settings.mode !== "flash" || state.revealed;
  elements.responseActions.hidden =
    state.settings.mode !== "flash" || !state.revealed || state.answered;
  elements.choicesGrid.hidden = state.settings.mode !== "choice";
  elements.typeForm.hidden = state.settings.mode !== "type";

  renderChoices();
}

function renderChoices() {
  if (state.settings.mode !== "choice") {
    elements.choicesGrid.innerHTML = "";
    return;
  }

  elements.choicesGrid.innerHTML = "";

  state.currentChoices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.dataset.choiceIndex = String(index);
    button.textContent = `${index + 1}. ${choice}`;

    if (!state.answered) {
      button.addEventListener("click", () => {
        submitResult(choice === state.currentCard.date, choice);
      });
    } else {
      button.disabled = true;
      if (choice === state.currentCard.date) {
        button.classList.add("correct");
      } else if (choice === state.selectedChoice && state.currentResult === "error") {
        button.classList.add("wrong");
      }
    }

    elements.choicesGrid.append(button);
  });
}

function updateStats() {
  const mastery = getMasteryPercent();
  const hardCards = getHardCards();
  const strongCardsCount = state.cards.filter((card) => getCardStats(card.id).streak >= 3).length;

  elements.totalCardsBadge.textContent = `${state.cards.length} дат`;
  elements.masteryBadge.textContent = `Освоение: ${mastery}%`;
  elements.focusBadge.textContent = `Сложных карточек: ${hardCards.length}`;
  elements.sessionReviewed.textContent = `${state.session.reviewed} ответов`;
  elements.sessionStreak.textContent = `Серия: ${state.session.streak}`;
  elements.correctCount.textContent = String(state.session.correct);
  elements.wrongCount.textContent = String(state.session.wrong);
  elements.bestStreak.textContent = String(state.session.bestStreak);
  elements.strongCards.textContent = String(strongCardsCount);
  elements.masteryBarFill.style.width = `${mastery}%`;

  renderHardCards(hardCards);
}

function renderHardCards(hardCards) {
  if (!hardCards.length) {
    elements.challengeList.innerHTML =
      '<li class="challenge-empty">Пока сложных карточек нет. Продолжай, и тренажёр сам найдёт слабые места.</li>';
    return;
  }

  elements.challengeList.innerHTML = hardCards
    .slice(0, 5)
    .map(
      ({ card, stats }) => `
        <li class="challenge-item">
          <strong>${escapeHtml(card.event)}</strong>
          <span>${escapeHtml(card.date)} • ошибок: ${stats.wrong} • верных: ${stats.correct}</span>
        </li>
      `,
    )
    .join("");
}

function getHardCards() {
  return state.cards
    .map((card) => ({ card, stats: getCardStats(card.id) }))
    .filter(({ stats }) => stats.wrong > 0)
    .sort((a, b) => {
      const aScore = a.stats.wrong * 2 - a.stats.correct;
      const bScore = b.stats.wrong * 2 - b.stats.correct;
      return bScore - aScore;
    });
}

function getMasteryPercent() {
  if (!state.cards.length) {
    return 0;
  }

  const total = state.cards.reduce((sum, card) => {
    const stats = getCardStats(card.id);

    if (stats.seen === 0) {
      return sum;
    }

    const score = Math.max(
      0,
      Math.min(1, (stats.correct + stats.streak) / (stats.seen + stats.wrong + 1)),
    );
    return sum + score;
  }, 0);

  return Math.round((total / state.cards.length) * 100);
}

function getCardStats(cardId) {
  if (!state.progress.cards[cardId]) {
    state.progress.cards[cardId] = {
      seen: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      lastSeenAt: null,
    };
  }

  return state.progress.cards[cardId];
}

function normalizeAnswer(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[–—−]/g, "-")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

function pushRecent(cardId) {
  state.recentIds = [cardId, ...state.recentIds.filter((id) => id !== cardId)].slice(0, 5);
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? JSON.parse(raw)
      : {
          cards: {},
          settings: {},
        };
  } catch (error) {
    console.error(error);
    return {
      cards: {},
      settings: {},
    };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function shuffleArray(items) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[target]] = [cloned[target], cloned[index]];
  }
  return cloned;
}

function ordinalLabel(index) {
  return `Карточка ${index}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
