"use client"

import React, { useLayoutEffect, useRef, useState, useCallback } from "react"
import { motion } from "framer-motion"

type Props = {
  children: React.ReactNode
  className?: string
  onDragStart?: () => void
  onDragEnd?: () => void
}

export default function SwipeCarousel({
  children,
  className = "flex",
  onDragStart,
  onDragEnd,
}: Props) {
  const wrapper = useRef<HTMLDivElement | null>(null)
  const items = useRef<HTMLDivElement | null>(null)

  const [carouselWidth, setCarouselWidth] = useState<number>(0)
  const [itemsWidth, setItemsWidth] = useState<number>(0)

  // calculate carousel and items width
  const calculateWidths = useCallback(() => {
    if (!wrapper.current || !items.current) return

    // measure wrapper width
    const wrapperClientWidth = wrapper.current.clientWidth
    setCarouselWidth(wrapperClientWidth)

    // measure total items width
    const totalItemsWidth = Array.from(items.current.children).reduce(
      (acc, child) => acc + (child as HTMLElement).offsetWidth,
      0
    )
    setItemsWidth(totalItemsWidth)
  }, [])

  // recalculate on resize or when children change
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    calculateWidths()

    const handleResize = () => calculateWidths()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [children, calculateWidths])

  return (
    <div ref={wrapper} className="relative overflow-hidden max-w-fit">
      <motion.div
        ref={items}
        drag="x"
        dragConstraints={{
          left: -(itemsWidth - carouselWidth),
          right: 0,
        }}
        dragElastic={0.2}
        dragTransition={{ bounceDamping: 20 }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  )
}
