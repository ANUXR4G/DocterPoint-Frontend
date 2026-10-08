/** Click-to-fill pain assessment labels. Stored value is the short label. */

export type PainChoice = { label: string; hint?: string }

export const PAIN_LOCATION_GROUPS: { group: string; options: string[] }[] = [
  {
    group: "Head & Neck",
    options: [
      "Head / Cranium",
      "Forehead",
      "Temple",
      "Occipital",
      "Face",
      "Jaw / TMJ",
      "Neck / Cervical Spine",
    ],
  },
  {
    group: "Chest & Upper Body",
    options: [
      "Chest (Anterior)",
      "Ribs",
      "Breast",
      "Upper Back (Thoracic Spine)",
      "Left Shoulder",
      "Right Shoulder",
    ],
  },
  {
    group: "Abdomen & Pelvis",
    options: [
      "Epigastrium",
      "Right Upper Quadrant (RUQ)",
      "Left Upper Quadrant (LUQ)",
      "Periumbilical",
      "Lower Abdomen",
      "Pelvis",
      "Groin",
    ],
  },
  {
    group: "Lower Back & Spine",
    options: ["Lumbar Spine", "Sacrum", "Left Flank", "Right Flank"],
  },
  {
    group: "Upper Extremities",
    options: [
      "Left Arm",
      "Right Arm",
      "Left Elbow",
      "Right Elbow",
      "Left Wrist",
      "Right Wrist",
      "Left Hand",
      "Right Hand",
      "Fingers",
    ],
  },
  {
    group: "Lower Extremities",
    options: [
      "Left Hip",
      "Right Hip",
      "Left Thigh",
      "Right Thigh",
      "Left Knee",
      "Right Knee",
      "Left Leg / Calf",
      "Right Leg / Calf",
      "Left Ankle",
      "Right Ankle",
      "Left Foot",
      "Right Foot",
      "Toes",
    ],
  },
  {
    group: "Generalized",
    options: ["Generalized Body Ache", "Diffuse Joint Pain"],
  },
]

export const PAIN_TYPES: PainChoice[] = [
  { label: "Aching / Dull", hint: "Constant, deep, continuous pain (musculoskeletal)." },
  { label: "Sharp / Stabbing", hint: "Acute, intense, knife-like sensation." },
  { label: "Burning / Tingling", hint: "Warm, prickling sensation (neuropathic/nerve pain)." },
  { label: "Throbbing / Pulsating", hint: "Rhythmically fluctuating (vascular/inflammatory)." },
  { label: "Shooting", hint: "Fast-traveling, electric-like pain along a nerve path." },
  { label: "Cramping / Spasmodic", hint: "Intermittent squeezing (visceral/muscle spasm)." },
  { label: "Tightness / Pressure", hint: "Constricting, heavy sensation." },
  { label: "Pricking / Pins & Needles", hint: "Localized paresthesia or superficial skin discomfort." },
]

export const PAIN_DURATION_PRESETS = [
  "< 1 Hour",
  "1–6 Hours",
  "6–24 Hours",
  "1–3 Days",
  "4–7 Days",
  "1–4 Weeks",
  "1–6 Months (Subacute)",
  "> 6 Months (Chronic)",
]

export const PAIN_DURATION_UNITS = ["Hours", "Days", "Weeks", "Months"] as const

export const PAIN_FREQUENCIES: PainChoice[] = [
  { label: "Constant / Continuous", hint: "Present all the time without relief." },
  { label: "Intermittent", hint: "Comes and goes periodically." },
  { label: "Paroxysmal / Sudden Attacks", hint: "Brief, intense spikes of pain." },
  { label: "Activity-Triggered / On Exertion", hint: "Triggered by motion, walking, coughing, or weight-bearing." },
  { label: "Post-Meal / Postprandial", hint: "Triggered after eating (visceral/GI)." },
  { label: "Worse in the morning", hint: "Diurnal pattern." },
  { label: "Worse at night", hint: "Diurnal pattern." },
  { label: "Worse after rest", hint: "Diurnal pattern." },
]

export const PAIN_RADIATIONS: PainChoice[] = [
  { label: "Non-Radiating / Localized", hint: "Confined strictly to the primary location." },
  { label: "Radiating to Neck / Jaw", hint: "Traverses upwards (cardiac/cervical origin)." },
  { label: "Radiating to Left Arm", hint: "Down the upper extremity (angina, cervical radiculopathy)." },
  { label: "Radiating to Right Arm", hint: "Down the upper extremity (angina, cervical radiculopathy)." },
  { label: "Radiating to Back", hint: "Through to the posterior trunk (aortic, pancreatic, or gallbladder)." },
  { label: "Radiating to Groin / Genitals", hint: "Downward from flank/abdomen (renal colic/kidney stones)." },
  { label: "Radiating down Leg (Sciatica)", hint: "Posterior/lateral thigh to foot (lumbar disc herniation)." },
]

export function parseCustomDuration(
  value: string,
): { n: string; unit: (typeof PAIN_DURATION_UNITS)[number] } | null {
  const m = /^(\d+)\s+(Hours|Days|Weeks|Months)$/.exec(value.trim())
  if (!m) return null
  return { n: m[1], unit: m[2] as (typeof PAIN_DURATION_UNITS)[number] }
}
