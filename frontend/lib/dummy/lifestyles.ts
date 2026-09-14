export const physicalActivities = ["Light", "Moderate", "Active", "Very Active"]
export const smokingStatuses = ["None Smoker", "Light", "Daily"]
export const familyHistoryStatuses = [
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Uncle",
  "Aunt",
  "Grand Father",
  "Grand Mother",
  "None",
]

export const bloodGroups = ["A+", "A-", "O+", "O-", "B-", "B+", "AB-", "AB+"]

/** UI label for previous_diabetes_records (general health, not diabetes-only). */
export const CHRONIC_CONDITIONS_LABEL = "Chronic conditions"

/** Selectable chronic / long-term conditions (includes legacy diabetes type strings). */
export const chronicConditions = [
  "Type 1",
  "Type 2",
  "Gestational",
  "MODY",
  "Wolfram Syndrome",
  "Alström Syndrome",
  "Neonatal",
  "LADA",
  "None Diabetic",
  "Pre Diabetic",
  "Type 3c",
  "Hypertension",
  "Asthma",
  "Heart disease",
  "Thyroid disorder",
  "Arthritis",
  "Kidney disease",
  "COPD",
  "Epilepsy",
  "Cancer (history)",
  "None",
]

/** @deprecated Use chronicConditions */
export const diabetesTypes = chronicConditions
