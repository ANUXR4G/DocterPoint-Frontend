"use client"

import { usePathname, useRouter } from "next/navigation"

import { Icon, Background } from "@/components"
import { routeLinks as content } from "@/lib/dummy/routes"

import { useProfile } from "@/hooks/useProfile"
import { useAppContext } from "@/hooks/useAppContext"

import Link from "next/link"

export default function Sidebar() {
  let pathname = usePathname()

  const router = useRouter()

  const { closeMenu, toggleChat } = useAppContext()
  const { logout } = useProfile(false)

  function handleHelpModal() {
    closeMenu()
    toggleChat()
  }

  return (
    <aside className="hidden xl:border-r-2 dark:border-r-neutral-800 fixed z-50 min-h-full h-full w-[72px] xl:w-60 top-0 left-0 xl:pt-6 md:flex flex-col">
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
        {/* overview routes */}
        <div className="flex flex-col gap-3">
          <span className="hidden xl:block text-xs text-opacity-70 ml-2 font-medium">
            Overview
          </span>
          {content.slice(0, 6).map(({ name, icon, dest }, idx) => (
            <Link
              href={dest ?? "#"}
              className={`rounded-xl xl:rounded-md transition duration-200 relative xl:flex xl:items-center ${
                pathname === dest
                  ? `text-[--primary-white] before:absolute before:content-[''] before:w-[5px] before:h-5/6 before:bg-[--primary-blue] bg-neutral-200 dark:bg-neutral-800 xl:bg-[--primary-blue] before:top-[5px] before:left-[-12px] before:rounded-r-xl xl:before:hidden`
                  : `hover:bg-neutral-200 dark:hover:bg-neutral-800`
              }`}
              key={`sidebar_upper_link_${idx}`}
            >
              <div className="w-12 h-12 flex items-center justify-center">
                <Icon
                  name={icon}
                  pathClassName={`transition duration-200 dark:stroke-neutral-300 ${
                    pathname === dest && `xl:stroke-[--primary-white]`
                  }`}
                />
              </div>
              <span className="hidden xl:block text-sm font-bold">{name}</span>
            </Link>
          ))}
        </div>

        {/* support routes */}
        <div className="flex flex-col gap-3 mt-3 xl:mt-6">
          <span className="hidden xl:block text-xs text-opacity-70 ml-2  font-medium">
            Support
          </span>
          {content.slice(6, content.length).map(({ name, icon, dest }, idx) => (
            <button
              className={`flex items-center transition duration-200 gap-2 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 ${
                idx === 2 &&
                `xl:mt-8 xl:mb-4 [@media(max-height:800px)]:xl:mb-2`
              } ${idx === 0 && `stroke-neutral-700`}`}
              key={`sidebar_bottom_link_${idx}`}
              onClick={() => {
                // handle user logout
                if (idx === 2) {
                  logout()
                  closeMenu()
                } else if (dest) {
                  router.push(dest) // handle settings
                } else {
                  handleHelpModal() // handle help modal
                }
              }}
            >
              <div className="rounded-xl w-12 h-12 flex items-center justify-center">
                <Icon
                  name={icon}
                  pathClassName="dark:stroke-[--primary-white]"
                />
              </div>
              <span className="hidden  xl:block text-sm font-bold">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
