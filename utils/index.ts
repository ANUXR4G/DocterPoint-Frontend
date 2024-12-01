import { DoctorType } from "@/lib/dummy/doctors"
import { TYPEMONITORING } from "@/lib/dummy/health"
import { HospitalType } from "@/lib/dummy/hospitals"
import { LocationType } from "@/types"

// handle encrypting text using aes in gcm mode
async function generateEncryptionAES(content: string): Promise<string> {
  if (typeof window === "undefined") return ""

  const enc = new TextEncoder()
  // encode the masterkey
  const rawKey = Uint8Array.from(
    atob(process.env.NEXT_PUBLIC_ENCRYPTION_SECRET_KEY as string),
    (c) => c.charCodeAt(0)
  )
  const key = await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
  // generate a 12bytes random string
  const iv = window.crypto.getRandomValues(new Uint8Array(12))

  // generate encrypted ciphertext w tag
  const ciphertextWithTag = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(content)
  )

  const ciphertext = new Uint8Array(ciphertextWithTag.slice(0, -16))
  const tag = new Uint8Array(ciphertextWithTag.slice(-16)) // last 16 bytes as tag

  // encrypt everything in a single base64 string
  return Buffer.concat([iv, ciphertext, tag]).toString("base64")
}

// generate a string e.g - a, b and c
function makeString(arr: string[]) {
  if (arr.length === 1) return arr[0]
  const last = arr[arr.length - 1]
  const rest = arr.slice(0, arr.length - 1)
  return rest.join(", ") + " and " + last
}

// group by category eg groupByCategory(mealRecommendations, "category")
function groupByCategory<ItemType, K extends keyof ItemType>(
  data: ItemType[],
  key: K
): Record<string, ItemType[]> {
  const res = data.reduce((acc, item) => {
    // extract the key that needs to be categorized
    const category = String(item[key])
    // if the category doesn't exists, create one w an empty array
    if (!acc[category]) {
      acc[category] = []
    }
    // if category does exists then push the items into the array
    acc[category].push(item)
    return acc || []
  }, {} as Record<string, ItemType[]>)

  return res
}

// generate an id
function getID(): string {
  return Math.random().toString(36).slice(2)
}

// generate random number between two numbers
function generateRandomNum(
  numbers: [number, number],
  floating?: boolean,
  fixed?: number
) {
  const min = numbers[0]
  const max = numbers[1]

  return floating
    ? (Math.random() * (max - min) + min).toFixed(fixed ? fixed : 1)
    : Math.floor(Math.random() * (max - min + 1) + min)
}

// get a unique array eg - getUniqueArr(data.map((item) => item.name))
// function getSpecificArr<ItemType, K extends keyof ItemType>(
//   data: ItemType[],
//   key: K | [K, ...(keyof ItemType[K])[]]
// ): (ItemType | ItemType[K])[] {
//   const res = data.map((item) => {
//     if (Array.isArray(key)) {
//       return key.reduce((acc, key) => (acc as any)[key], item)
//     } else {
//       return item[key]
//     }
//   })

//   return Array.from(new Set(res))
// }

// e.g - getSpecificArr(data.map((item) => item.name)) (simple)
function getSpecificArr<ItemType>(data: ItemType[]): ItemType[] {
  return Array.from(data.reduce((set, e) => set.add(e), new Set<ItemType>()))
}

// camelize a text or word
function camelize(text: string): string {
  let _text = text
    .toLowerCase()
    .trim()
    .split(/[.\-_\s]/g) // removes all (- space _ .)
    .reduce(
      (str, nextWord) => str + nextWord[0].toUpperCase() + nextWord.slice(1)
    )

  return _text
}

// convert minutes to `h:m` format
function convertMinToHourMinFormat(duration: number) {
  const hours = duration / 60
  const convertedHours = Math.floor(hours)
  const mins = Math.round((hours - convertedHours) * 60)

  return `${convertedHours}h ${mins}m`
}

// get expiriration time in a token
function getTokenDuration(token: string) {
  const [, payload] = token.split(".")
  if (!payload) return 0
  const decodedPayload = JSON.parse(atob(payload))
  return decodedPayload.exp
}

// custom type checker
function isDoctorType(item: any): item is DoctorType {
  return (item as DoctorType).gender !== undefined
}

function isHospitalLocationType(item: any): item is LocationType {
  return (item as LocationType).cityName !== undefined
}

function isHospitalType(item: any): item is HospitalType {
  return (item as HospitalType).geometry !== undefined
}

export const firey = {
  groupByCategory,
  convertMinToHourMinFormat,
  getSpecificArr,
  getID,
  generateRandomNum,
  makeString,
  getTokenDuration,
  camelize,
  isDoctorType,
  isHospitalType,
  isHospitalLocationType,
  generateEncryption: generateEncryptionAES,
}
