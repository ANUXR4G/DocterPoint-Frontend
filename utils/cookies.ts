function getCookie(name: string) {
  if (typeof document === "undefined") return ""

  const targetedCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}`))

  if (!targetedCookie) return ""
  return targetedCookie.split("=")[1]
}

function setCookie(name: string, value: string, expires: number) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=${value}; Max-Age=${expires}; path=/`
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=; expires=Thu, 16 Dec 1971 00:00:00 GMT; path=/`
}

export const cookies = {
  getCookie,
  setCookie,
  deleteCookie,
}
