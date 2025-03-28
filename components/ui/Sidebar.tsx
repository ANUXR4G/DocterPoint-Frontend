"use client"

import Link from "next/link"

import { usePathname, useRouter } from "next/navigation"

import { Icon, Background } from "@/components"
import { routes } from "@/lib/dummy/routes"
import { useAppContext } from "@/hooks/useAppContext"

type Props = {
  role?: string | null
  logout: () => Promise<void>
}

export default function Sidebar({ role, logout }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { closeMenu, toggleHelp } = useAppContext()

  function handleHelpModal() {
    closeMenu()
    toggleHelp()
  }

  const content = role ? (role in routes ? routes[role] : []) : []

  return (
    <aside className="hidden xl:border-r-2 dark:border-r-neutral-800 fixed z-40 min-h-full h-full w-[72px] xl:w-60 top-0 left-0 xl:pt-6 md:flex flex-col">
      <Background name="half-box-pattern" className="hidden dark:xl:block" />
      <Background name="gradient-3" />
      {/* logo */}
      <div className="hidden xl:flex justify-center items-center gap-2 mb-4">
        <Icon className="w-8 h-8 -ml-4" name="gluco-guide" />
        <h3 className="font-bold bg-gradient-to-r text-lg from-blue-800 to-indigo-900 bg-clip-text text-transparent dark:from-indigo-500 dark:to-blue-500">
          GlucoGuide
        </h3>
      </div>

      <div className="h-full w-full flex items-center xl:items-stretch flex-col py-4 xl:px-4 xl:pb-3 xl:justify-between overflow-y-auto justify-center [@media(max-height:600px)]:justify-start no-scrollbar xl:show-scrollbar xl:custom-scroll">
        {/* Overview routes */}
        <div className="flex flex-col gap-3">
          <span className="hidden xl:block text-xs text-opacity-70 ml-2 font-medium">
            Overview
          </span>
          {content
            .slice(0, role === "admin" ? 5 : 6)
            .map(({ name, icon, dest }, idx) => (
              <Link
                href={dest ?? "#"}
                className={`rounded-xl xl:rounded-md transition duration-200 relative xl:flex xl:items-center ${
                  pathname === dest
                    ? `text-[--primary-white] before:absolute before:content-[''] before:w-[5px] before:h-5/6 before:bg-[--primary-blue] bg-neutral-200 dark:bg-neutral-800 xl:bg-[--primary-blue] before:top-[5px] before:left-[-12px] before:rounded-r-xl xl:before:hidden`
                    : `hover:bg-neutral-200 dark:hover:bg-neutral-800`
                }`}
                key={`sidebar_upper_link_${idx}`}
              >
                <div className="size-12 flex items-center justify-center">
                  <Icon
                    name={icon}
                    pathClassName={`transition duration-200 ${
                      pathname === dest
                        ? `stroke-neutral-200 dark:stroke-neutral-100 `
                        : `stroke-neutral-700 dark:stroke-neutral-400`
                    }`}
                  />
                </div>
                <span className="hidden -mt-[1px] xl:block text-sm font-bold">
                  {name}
                </span>
              </Link>
            ))}
        </div>

        {/* Support routes */}
        <div className="flex flex-col gap-3 mt-3 xl:mt-6">
          <span className="hidden xl:block text-xs text-opacity-70 ml-2  font-medium">
            Support
          </span>
          {content
            .slice(role === "admin" ? 5 : 6, content.length)
            .map(({ name, icon, dest }, idx) => (
              <button
                className={`relative flex items-center transition duration-200 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 ${
                  idx === 2 &&
                  `xl:mt-8 xl:mb-4 [@media(max-height:800px)]:xl:mb-2`
                } ${
                  idx === 0 &&
                  pathname === dest &&
                  `before:absolute before:content-[''] before:w-[5px] before:h-5/6 before:bg-[--primary-blue] bg-neutral-200 dark:bg-neutral-800 xl:bg-[--primary-blue] before:top-[5px] before:left-[-12px] before:rounded-r-xl xl:before:hidden text-[--primary-white] hover:before:bg-[--primary-blue] hover:xl:bg-[--primary-blue]`
                } ${idx === 0 && `stroke-neutral-700`}`}
                key={`sidebar_bottom_link_${idx}`}
                onClick={async () => {
                  // Handle user logout
                  if (idx === 2) {
                    await logout()
                    closeMenu()
                  } else if (dest) {
                    router.push(dest) // Handle settings
                  } else {
                    handleHelpModal() // Handle help modal
                  }
                }}
              >
                <div className="rounded-xl size-12 flex items-center justify-center">
                  <Icon
                    name={icon}
                    pathClassName={
                      pathname === dest
                        ? `stroke-neutral-200 `
                        : `dark:stroke-neutral-400`
                    }
                  />
                </div>
                <span className="hidden -mt-[1px] xl:block text-sm font-bold">
                  {name}
                </span>
              </button>
            ))}
        </div>
      </div>
    </aside>
  )
}
