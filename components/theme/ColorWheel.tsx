"use client"

import { useEffect, useRef, useState } from "react"
import {
  hexToHsv,
  hsvToHex,
  isHexColor,
  type Hsv,
} from "@/lib/colorWheel"

const SIZE = 248
const RING = 28
const SQUARE = 128

type Props = {
  color: string
  onChange: (hex: string) => void
}

/** Hue ring with a saturation square. Red sits at the top; the square is saturated on the left. */
export default function ColorWheel({ color, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hsv, setHsv] = useState<Hsv>(() =>
    isHexColor(color) ? hexToHsv(color) : { h: 0, s: 1, v: 1 },
  )
  const hsvRef = useRef(hsv)
  hsvRef.current = hsv

  useEffect(() => {
    if (dragging.current || !isHexColor(color)) return
    const next = hexToHsv(color)
    hsvRef.current = next
    setHsv(next)
  }, [color])

  const cx = SIZE / 2
  const cy = SIZE / 2
  const ringMid = SIZE / 2 - RING / 2
  const inner = SIZE / 2 - RING
  const squareOrigin = (SIZE - SQUARE) / 2
  const current = hsvToHex(hsv.h, hsv.s, hsv.v)
  const hueColor = hsvToHex(hsv.h, 1, 1)
  const hueRad = (hsv.h * Math.PI) / 180
  const hueX = cx + Math.sin(hueRad) * ringMid
  const hueY = cy - Math.cos(hueRad) * ringMid
  const satX = squareOrigin + (1 - hsv.s) * SQUARE
  const satY = squareOrigin + (1 - hsv.v) * SQUARE

  function applyPoint(clientX: number, clientY: number) {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left
    const y = clientY - rect.top
    const dx = x - cx
    const dy = y - cy
    const dist = Math.hypot(dx, dy)
    const current = hsvRef.current
    let next = current
    if (
      x >= squareOrigin &&
      x <= squareOrigin + SQUARE &&
      y >= squareOrigin &&
      y <= squareOrigin + SQUARE
    ) {
      const s = 1 - (x - squareOrigin) / SQUARE
      const v = 1 - (y - squareOrigin) / SQUARE
      next = { ...current, s, v }
    } else if (dist >= inner - 4 && dist <= SIZE / 2 + 6) {
      const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
      next = { ...current, h: hue }
    } else {
      return
    }
    hsvRef.current = next
    setHsv(next)
    onChange(hsvToHex(next.h, next.s, next.v))
  }

  return (
    <div
      ref={boxRef}
      role="application"
      aria-label="Custom theme colour"
      className="relative touch-none select-none rounded-full"
      style={{ width: SIZE, height: SIZE, background: "#ececec" }}
      onPointerDown={(event) => {
        dragging.current = true
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* Pointer capture is unavailable for some synthetic events. */
        }
        applyPoint(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        applyPoint(event.clientX, event.clientY)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          WebkitMaskImage: `radial-gradient(circle, transparent ${inner - 0.5}px, #000 ${inner}px)`,
          maskImage: `radial-gradient(circle, transparent ${inner - 0.5}px, #000 ${inner}px)`,
        }}
      />
      <div
        className="absolute overflow-hidden"
        style={{
          left: squareOrigin,
          top: squareOrigin,
          width: SQUARE,
          height: SQUARE,
          backgroundColor: hueColor,
        }}
      >
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, transparent, #ffffff)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent, #000000)" }}
        />
      </div>
      <span
        className="pointer-events-none absolute size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
        style={{ left: hueX, top: hueY, backgroundColor: hueColor }}
      />
      <span
        className="pointer-events-none absolute size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
        style={{ left: satX, top: satY, backgroundColor: current }}
      />
    </div>
  )
}
