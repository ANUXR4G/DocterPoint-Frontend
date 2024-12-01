import { useState } from "react"

export function useFakeFetch(
  url: string,
  options: { method: "GET" | "POST"; body?: string } = { method: "GET" }
) {
  const [data] = useState([
    { id: 1, name: "walterwhite" },
    { id: 2, name: "jessiepinkman" },
  ])
  return new Promise((resolve) => {
    setTimeout(() => {
      if (options.method === "POST" && options.body) {
        const newItem = JSON.parse(options.body)
        data.push(newItem)
        resolve({ status: 201, json: () => Promise.resolve(newItem) })
      } else {
        resolve({ status: 200, json: () => Promise.resolve(data) })
      }
    }, 500)
  })
}
