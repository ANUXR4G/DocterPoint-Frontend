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

/**
 * Splits an array into subarrays of specified size and optionally keys them.
 *
 * @param array - The array to be split into chunks.
 * @param size - The size of each chunk.
 * @param key - Boolean flag indicating if custom keys should be added.
 *              If true and array elements are strings or numbers, keys are
 *              based on the first and last elements of each chunk.
 *              If false, keys are based on chunk index.
 * @returns A record of chunks, where each key is either the chunk index
 *          or a custom key based on the chunk values.
 */
function chunkArray<T>(
  array: T[],
  size: number,
  key: boolean = false
): Record<string, T[]> {
  return array.reduce((acc: Record<string, T[]>, _, i) => {
    // process every chunk based on size
    if (i % size === 0) {
      let subArray = array.slice(i, i + size) // create a subarray of the specified size
      // determine the chunk key based on the type of array elements and the key flag
      let chunkKey = key
        ? `${subArray[subArray.length - 1]}-${subArray[0]}`
        : `${Math.floor(i / size)}`

      // add the subarray to the accumulator with the determined key
      acc[chunkKey] = subArray
    }
    return acc
  }, {})
}

// recursive function to convert object keys to camelCase
function convertKeysToCamelCase<T>(data: T): T {
  if (Array.isArray(data)) {
    // recursively convert keys in arrays
    return data.map((item) => convertKeysToCamelCase(item)) as T
  } else if (data !== null && typeof data === "object") {
    // Recursively convert keys in objects
    return Object.entries(data).reduce((acc, [key, value]) => {
      const camelCaseKey = snakeToCamelCase(key)
      acc[camelCaseKey] = convertKeysToCamelCase(value)
      return acc
    }, {} as Record<string, unknown>) as T
  }
  return data // return the value as is for non object types
}

function filterNullValues(obj: {
  [key: string]:
    | string
    | number
    | Date
    | null
    | (string | number | Date | null)[]
}) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== null))
}

function camelToCapitalize(camelCaseString: string): string {
  return camelCaseString
    .replace(/([a-z])([A-Z])/g, "$1 $2") // add space before each capital letter
    .replace(/([A-Z])/g, " $1") // add space before each capital letter
    .replace(/\s+/g, " ") // replace multiple spaces with a single space
    .trim() // remove leading and trailing spaces
    .replace(/^\w/, (match) => match.toUpperCase()) // capitalize the first letter
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

// Decode the JWT Token
function getTokenInfo(token: string) {
  if (!token) return "firey"
  const [, payload] = token.split(".")
  if (!payload) return "firey"
  return JSON.parse(atob(payload))
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

function distributeItems(dataObj: any, items: any) {
  // get the keys of the data object
  const keys = Object.keys(dataObj)
  let currentKeyIndex = 0

  // find the next empty array in the data
  const findNextEmptyKey = () => {
    for (let i = 0; i < keys.length; i++) {
      if (dataObj[keys[i]].length === 0) {
        return i
      }
    }
    return -1
  }

  const newData = { ...dataObj }

  // fill empty items first
  for (const item of items) {
    const emptyKeyIndex = findNextEmptyKey()
    if (emptyKeyIndex !== -1) {
      newData[keys[emptyKeyIndex]].push(item)
    } else {
      // distribute in a round-robin manner
      newData[keys[currentKeyIndex]].push(item)
      currentKeyIndex = (currentKeyIndex + 1) % keys.length
    }
  }

  return newData
}

// get the size of a nested object which contains arrays
function countSizeOfNestedArrObject(givenObj: { [key: string]: any }) {
  return Object.keys(givenObj).reduce(
    (acc, key) => acc + givenObj[key].length,
    0
  )
}

function uuidToBase64(uuid: unknown): string | null {
  if (typeof uuid !== "string") {
    console.error("Invalid UUID:", uuid)
    return null
  }

  // Remove hyphens from the UUID
  const hexString = uuid.replace(/-/g, "")

  // Convert hex string to byte array
  const byteArray = new Uint8Array(hexString.length / 2)
  for (let i = 0; i < hexString.length; i += 2) {
    byteArray[i / 2] = parseInt(hexString.substring(i, i + 2), 16)
  }

  // Convert byte array to Base64
  const base64String = btoa(
    String.fromCharCode.apply(null, Array.from(byteArray))
  )

  // Remove any extra padding '=' characters added by base64 encoding
  return base64String.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}

export const firey = {
  getID,
  camelize,
  makeString,
  chunkArray,
  objIsEmpty,
  getTokenInfo,
  uuidToBase64,
  calculateAge,
  getSpecificArr,
  distributeItems,
  groupByCategory,
  snakeToCamelCase,
  getTokenDuration,
  filterNullValues,
  generateRandomNum,
  camelToCapitalize,
  createSearchParams,
  convertKeysToCamelCase,
  convertMinToHourMinFormat,
  countSizeOfNestedArrObject,
  generateEncryption: generateEncryptionAES,
}
