export const dummySuggestions: Record<string, Record<string, unknown>> = {
  "18-24": {
    energy_goal: 2500,
    hydration: "8",
    sleep: "8 hours",
    dietary: [
      { time: "breakfast", energy: 625 },
      { time: "lunch", energy: 725 },
      { time: "snacks", energy: 125 },
      { time: "dinner", energy: 725 },
    ],
    nutritions: [
      { name: "protein", amount: 56 },
      { name: "fat", amount: 80 },
      { name: "carbs", amount: 300 },
    ],
  },
  "25-34": {
    energy_goal: 2400,
    hydration: "8",
    sleep: "7-8 hours",
    dietary: [
      { time: "breakfast", energy: 600 },
      { time: "lunch", energy: 700 },
      { time: "snacks", energy: 120 },
      { time: "dinner", energy: 680 },
    ],
    nutritions: [
      { name: "protein", amount: 55 },
      { name: "fat", amount: 78 },
      { name: "carbs", amount: 290 },
    ],
  },
  "35-44": {
    energy_goal: 2300,
    hydration: "8",
    sleep: "7-8 hours",
    dietary: [
      { time: "breakfast", energy: 575 },
      { time: "lunch", energy: 675 },
      { time: "snacks", energy: 115 },
      { time: "dinner", energy: 650 },
    ],
    nutritions: [
      { name: "protein", amount: 54 },
      { name: "fat", amount: 76 },
      { name: "carbs", amount: 285 },
    ],
  },
  "45-54": {
    energy_goal: 2200,
    hydration: "8",
    sleep: "7-8 hours",
    dietary: [
      { time: "breakfast", energy: 550 },
      { time: "lunch", energy: 650 },
      { time: "snacks", energy: 110 },
      { time: "dinner", energy: 620 },
    ],
    nutritions: [
      { name: "protein", amount: 52 },
      { name: "fat", amount: 74 },
      { name: "carbs", amount: 270 },
    ],
  },
  "55-64": {
    energy_goal: 2100,
    hydration: "8",
    sleep: "7-9 hours",
    dietary: [
      { time: "breakfast", energy: 525 },
      { time: "lunch", energy: 625 },
      { time: "snacks", energy: 105 },
      { time: "dinner", energy: 605 },
    ],
    nutritions: [
      { name: "protein", amount: 50 },
      { name: "fat", amount: 72 },
      { name: "carbs", amount: 260 },
    ],
  },
  "65+": {
    energy_goal: 2000,
    hydration: "8",
    sleep: "7-9 hours",
    dietary: [
      { time: "breakfast", energy: 500 },
      { time: "lunch", energy: 600 },
      { time: "snacks", energy: 100 },
      { time: "dinner", energy: 590 },
    ],
    nutritions: [
      { name: "protein", amount: 48 },
      { name: "fat", amount: 70 },
      { name: "carbs", amount: 250 },
    ],
  },
};

export const exercises = [
  { name: "Running", times: ["morning", "evening"], duration: "30-45mins" },
  { name: "Rowing", times: ["morning"], duration: "15-20mins" },
  { name: "Play Tennis", times: ["evening"], duration: "1-2hrs" },
  { name: "Cycling", times: ["evening"], duration: "40-50mins" },
];
