"use client"

import Image from "next/image"
import Link from "next/link"

import { Icon, SimpleModal, ThemeSwitch } from "@/components"
import { useProfile } from "@/hooks/useProfile"
import { useAppContext } from "@/hooks/useAppContext"

type Props = {
  open: boolean
  toggleModal: () => void
  closeModal: () => void
}

export default function ProfileMenu({ open, toggleModal, closeModal }: Props) {
  const { toggleChat } = useAppContext()
  const { data, logout } = useProfile()

  function handleSupport() {
    toggleChat()
    closeModal()
  }

  function handleLogout() {
    logout()
    closeModal()
  }

  if (!data) return <div />

  return (
    <SimpleModal
      open={open}
      closeModal={closeModal}
      className="border dark:border-transparent shadow-md dark:shadow-[inset_0_0_0_1px_rgba(248,248,248,0.2)] px-3 py-2 rounded-lg right-4 top-14 flex flex-col bg-[--primary-white] dark:bg-neutral-800 select-none"
      content={
        <div
          className="relative w-9 h-9 border-2 dark:border-neutral-200 border-neutral-800 rounded-full hover:cursor-pointer bg-slate-600"
          onClick={toggleModal}
        >
          <Image
            fill
            src={
              data.imgSrc ||
              `${`https://res.cloudinary.com/firey/image/upload/v1708816390/iub/${
                data.gender
                  ? data.gender === `male`
                    ? `male`
                    : `female`
                  : `male`
              }_12.jpg`}`
            }
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            alt={`${data.id}.jpg`}
            style={{ objectFit: "cover" }}
            priority
            className="rounded-full"
          />
          {/* overlay */}
          <div className="min-h-full min-w-full bg-black/25 absolute top-0 right-0 bottom-0 left-0 rounded-full" />
        </div>
      }
    >
      <div className="min-w-44 lg:min-w-48 flex flex-col divide-y-2 dark:divide-neutral-700">
        {/* user basic information */}
        <div className="px-2 py-1.5">
          <h3 className="text-sm font-semibold leading-4">
            {data?.name || "Guest Account"}
          </h3>
          <p className="text-xs font-medium lg:font-bold line-clamp-1 opacity-70">
            {data?.email || "tripinsinceidk"}
          </p>
        </div>

        {/* route options */}
        <div className="py-1">
          <Link
            href={"/patient/profile"}
            className="w-full group flex items-center gap-2 py-2 rounded-md px-2.5 hover:bg-zinc-200/70 dark:hover:bg-neutral-700/60"
            onClick={closeModal}
          >
            <div className="hover:[&_svg]:">
              <Icon
                name="human-circle"
                className="size-5 opacity-80 group-hover:opacity-100"
                pathClassName="dark:stroke-neutral-500 group-hover:dark:stroke-neutral-400"
              />
            </div>
            <span className="text-sm font-semibold opacity-80 group-hover:opacity-100">
              Profile
            </span>
          </Link>
          <Link
            href={"/patient/settings"}
            className="w-full group flex items-center gap-2 py-2 rounded-md px-2.5 hover:bg-zinc-200/70 dark:hover:bg-neutral-700/60"
            onClick={closeModal}
          >
            <div>
              <Icon
                name="settings"
                className="size-5 opacity-80 group-hover:opacity-100"
                pathClassName="stroke-neutral-700 dark:stroke-neutral-500 group-hover:dark:stroke-neutral-400"
              />
            </div>
            <span className="text-sm font-semibold opacity-80 group-hover:opacity-100">
              Settings
            </span>
          </Link>
        </div>

        {/* support option and theme switcher */}
        <div className="py-1">
          <ThemeSwitch />
          <button
            className="group w-full flex items-center gap-2 py-2 rounded-md px-2.5 hover:bg-zinc-200/70 dark:hover:bg-neutral-700/60"
            onClick={handleSupport}
          >
            <div>
              <Icon
                name="two-people"
                className="size-5 opacity-80 group-hover:opacity-100"
                pathClassName="dark:stroke-neutral-500 group-hover:dark:stroke-neutral-400"
              />
            </div>
            <span className="text-sm font-semibold opacity-80 group-hover:opacity-100">
              Support
            </span>
          </button>
        </div>

        {/* logout */}
        <div className="py-1">
          <button
            onClick={handleLogout}
            className="group w-full flex items-center gap-2 py-2 rounded-md px-2.5 hover:bg-zinc-200/70 dark:hover:bg-neutral-700/60"
          >
            <div>
              <Icon
                name="logout"
                className="size-5 opacity-80 group-hover:opacity-100"
                pathClassName="dark:stroke-neutral-500 group-hover:dark:stroke-neutral-400"
              />
            </div>
            <span className="text-sm font-semibold opacity-80 group-hover:opacity-100">
              Logout
            </span>
          </button>
        </div>
      </div>
    </SimpleModal>
  )
}
