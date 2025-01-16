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

function calculateAge(dateString: string): number {
  // parse the date string in the format "DD/MM/YYYY"
  const [day, month, year] = dateString.split("/").map(Number)
  const birthDate = new Date(year, month - 1, day) // month is 0-indexed

  // Get today's date
  const today = new Date()

  // calculate the age
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  // adjust age if the birthday hasn't occurred yet this year
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--
  }

  return age
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

// Utility function to convert snake_case to camelCase
function snakeToCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

// recursive function to convert object keys to camelCase
function convertKeysToCamelCase<T>(data: T): T {
  if (Array.isArray(data)) {
    // recursively convert keys in arrays
    return data.map((item) => convertKeysToCamelCase(item)) as unknown as T
  } else if (data !== null && typeof data === "object") {
    // Recursively convert keys in objects
    return Object.entries(data).reduce((acc, [key, value]) => {
      const camelCaseKey = snakeToCamelCase(key)
      acc[camelCaseKey] = convertKeysToCamelCase(value)
      return acc
    }, {} as Record<string, any>) as T
  }
  return data // return the value as is for non object types
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

function objIsEmpty(values: Record<string, unknown[]>) {
  return Object.values(values).every((item) => item.length === 0)
}

function createSearchParams(params: Record<string, unknown | unknown[]>) {
  return new URLSearchParams(
    Object.entries(params).flatMap(([key, values]) =>
      Array.isArray(values)
        ? values.map((value) => [key, value])
        : [[key, values]]
    )
  )
}

export const firey = {
  groupByCategory,
  convertMinToHourMinFormat,
  getSpecificArr,
  getID,
  calculateAge,
  generateRandomNum,
  makeString,
  getTokenDuration,
  camelize,
  snakeToCamelCase,
  convertKeysToCamelCase,
  objIsEmpty,
  createSearchParams,
  generateEncryption: generateEncryptionAES,
}
