"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Icon } from "@/components"
import type { TRouteProps } from "@/types"

type Props = {
  items: TRouteProps[]
  pathname: string | null
  currentTab: string | null
  navActiveFn: (
    path: string,
    dest?: string | null,
    tab?: string | null,
  ) => boolean
  navBadgeCount: (name: string) => number
  navLinkClass: (active: boolean) => string
  /** Compact icon rail (md–lg); expanded labels at xl. */
  variant: "sidebar" | "menu"
  onNavigate?: () => void
  linkKeyPrefix: string
}

export default function NavOverviewItems({
  items,
  pathname,
  currentTab,
  navActiveFn,
  navBadgeCount,
  navLinkClass,
  variant,
  onNavigate,
  linkKeyPrefix,
}: Props) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const item of items) {
      if (!item.children?.length) continue
      const childActive = item.children.some((c) =>
        navActiveFn(pathname || "", c.dest, currentTab),
      )
      if (childActive) next[item.name] = true
    }
    if (Object.keys(next).length) {
      setOpenGroups((prev) => ({ ...prev, ...next }))
    }
  }, [items, pathname, currentTab, navActiveFn])

  function renderLeaf(item: TRouteProps, key: string, indented = false) {
    const active = navActiveFn(pathname || "", item.dest, currentTab)
    const badge = navBadgeCount(item.name)
    const iconWrap =
      variant === "sidebar"
        ? "relative flex size-10 shrink-0 items-center justify-center xl:size-9"
        : "relative shrink-0"
    const labelWrap =
      variant === "sidebar"
        ? "hidden flex-1 items-center gap-2 text-[13px] font-semibold tracking-[-0.1px] xl:flex"
        : "flex flex-1 items-center gap-2 text-[13px] font-semibold tracking-[-0.1px]"

    return (
      <Link
        href={item.dest ?? "#"}
        onClick={() => onNavigate?.()}
        className={`${navLinkClass(active)} ${indented ? (variant === "sidebar" ? "xl:pl-6" : "pl-8") : ""}`}
        key={key}
      >
        <div className={iconWrap}>
          <Icon
            name={item.icon}
            className={variant === "menu" ? "size-5" : undefined}
            pathClassName={`transition duration-200 ${
              active
                ? "stroke-slate-900 dark:stroke-white"
                : "stroke-slate-400 dark:stroke-slate-500"
            }`}
          />
          {badge > 0 && variant === "sidebar" ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white xl:hidden">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </div>
        <span className={labelWrap}>
          <span>{item.name}</span>
          {badge > 0 ? (
            <span
              className={`rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white ${
                variant === "sidebar" ? "" : "ml-auto"
              }`}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
      </Link>
    )
  }

  return (
    <>
      {items.map((item, idx) => {
        const kids = item.children
        if (!kids?.length) {
          return renderLeaf(item, `${linkKeyPrefix}_${idx}`)
        }

        const groupActive = kids.some((c) =>
          navActiveFn(pathname || "", c.dest, currentTab),
        )
        const open = openGroups[item.name] ?? groupActive

        // Collapsed sidebar rail: show child icons only.
        if (variant === "sidebar") {
          return (
            <div key={`${linkKeyPrefix}_group_${idx}`} className="contents">
              <div className="hidden xl:block">
                <button
                  type="button"
                  className={`${navLinkClass(groupActive)} w-full`}
                  onClick={() =>
                    setOpenGroups((prev) => ({
                      ...prev,
                      [item.name]: !open,
                    }))
                  }
                  aria-expanded={open}
                >
                  <div className="relative flex size-9 shrink-0 items-center justify-center">
                    <Icon
                      name={item.icon}
                      pathClassName={
                        groupActive
                          ? "stroke-slate-900 dark:stroke-white"
                          : "stroke-slate-400 dark:stroke-slate-500"
                      }
                    />
                  </div>
                  <span className="flex flex-1 items-center justify-between gap-2 text-[13px] font-semibold tracking-[-0.1px]">
                    <span>{item.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {open ? "▾" : "▸"}
                    </span>
                  </span>
                </button>
                {open
                  ? kids.map((child, cIdx) =>
                      renderLeaf(
                        child,
                        `${linkKeyPrefix}_${idx}_${cIdx}`,
                        true,
                      ),
                    )
                  : null}
              </div>
              <div className="contents xl:hidden">
                {kids.map((child, cIdx) =>
                  renderLeaf(child, `${linkKeyPrefix}_rail_${idx}_${cIdx}`),
                )}
              </div>
            </div>
          )
        }

        return (
          <div key={`${linkKeyPrefix}_group_${idx}`}>
            <button
              type="button"
              className={`${navLinkClass(groupActive)} w-full`}
              onClick={() =>
                setOpenGroups((prev) => ({
                  ...prev,
                  [item.name]: !open,
                }))
              }
              aria-expanded={open}
            >
              <div className="relative shrink-0">
                <Icon
                  name={item.icon}
                  className="size-5"
                  pathClassName={
                    groupActive
                      ? "stroke-slate-900 dark:stroke-white"
                      : "stroke-slate-400 dark:stroke-slate-500"
                  }
                />
              </div>
              <span className="flex flex-1 items-center justify-between gap-2 text-[13px] font-semibold tracking-[-0.1px]">
                <span>{item.name}</span>
                <span className="text-[10px] text-slate-400">
                  {open ? "▾" : "▸"}
                </span>
              </span>
            </button>
            {open
              ? kids.map((child, cIdx) =>
                  renderLeaf(child, `${linkKeyPrefix}_${idx}_${cIdx}`, true),
                )
              : null}
          </div>
        )
      })}
    </>
  )
}
