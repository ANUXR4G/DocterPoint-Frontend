"use client"

import { useMemo, useRef, useState } from "react"
import MapGL, { Marker, Popup } from "react-map-gl/mapbox"
import "mapbox-gl/dist/mapbox-gl.css"
import Image from "next/image"
import Icon from "../icons"
import { HospitalType } from "@/lib/dummy/hospitals"
import Button from "../buttons/Button"
import Link from "next/link"
import { THospital } from "@/types"

type Props = {
  hospitals: THospital[]
  coordinates?: number[]
  className?: string
  zoom?: number
  disableResetBtn?: boolean
}

const FALLBACK_HOSPITAL_IMG =
  "https://images.pexels.com/photos/263402/pexels-photo-263402.jpeg"
const DEFAULT_CENTER: [number, number] = [90.391, 23.752]

function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function sanitizePair(
  pair?: number[] | null,
  fallback: [number, number] = DEFAULT_CENTER,
): [number, number] {
  if (
    Array.isArray(pair) &&
    pair.length >= 2 &&
    isFiniteCoord(pair[0]) &&
    isFiniteCoord(pair[1])
  ) {
    return [pair[0], pair[1]]
  }
  return fallback
}

function hospitalImageSrc(src?: string | null) {
  const trimmed = src?.trim()
  return trimmed ? trimmed : FALLBACK_HOSPITAL_IMG
}

export default function Map({
  hospitals,
  coordinates = DEFAULT_CENTER,
  className,
  zoom = 12.5,
  disableResetBtn = false,
}: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
  const center = sanitizePair(coordinates)

  const [viewState, setViewState] = useState({
    latitude: center[1],
    longitude: center[0],
    zoom,
  })

  const mapRef = useRef<any>(null)
  const [selectedHospital, setSelectedHospital] = useState<HospitalType | null>(
    null,
  )

  const plottable = useMemo(
    () =>
      hospitals.filter((hospital) => {
        const coords = hospital?.geometry?.coordinates
        return (
          Array.isArray(coords) &&
          coords.length >= 2 &&
          isFiniteCoord(coords[0]) &&
          isFiniteCoord(coords[1])
        )
      }),
    [hospitals],
  )

  function handleReset() {
    if (!mapRef.current) return
    mapRef.current.flyTo({
      center,
      zoom: 12.5,
      speed: 1,
    })
  }

  if (!token) {
    return (
      <div
        className={`flex w-full flex-col ${
          className ? className : `mt-1 h-80 sm:h-[516px]`
        }`}
      >
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-100 px-4 text-center dark:border-neutral-700 dark:bg-neutral-800/60">
          <p className="max-w-sm text-sm font-semibold text-neutral-600 dark:text-neutral-300">
            Map unavailable — set{" "}
            <code className="text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code className="text-xs">frontend/.env</code> to enable Mapbox.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex w-full flex-col ${
        className ? className : `mt-1 h-80 sm:h-[516px]`
      }`}
    >
      <MapGL
        mapboxAccessToken={token}
        style={{ width: "100%", height: "100%" }}
        onMove={(e) => setViewState(e.viewState)}
        mapStyle="mapbox://styles/mapbox/streets-v11"
        ref={mapRef}
        {...viewState}
      >
        {plottable.map((hospital) => {
          const [lng, lat] = hospital.geometry.coordinates
          return (
            <Marker
              key={hospital.id}
              latitude={lat}
              longitude={lng}
              onClick={() => {
                if (!mapRef.current) return
                setSelectedHospital(hospital)
                mapRef.current.flyTo({
                  center: [lng, lat],
                  zoom: viewState.zoom,
                  speed: 1,
                })
              }}
            >
              <div className="marker-btn center size-10 cursor-pointer rounded-full bg-slate-100 ring-4 ring-blue-500">
                <div className="relative size-6">
                  <Image
                    fill
                    src="https://res.cloudinary.com/dwhlynqj3/image/upload/v1720969669/glucoguide/gluco-guide-logo.png"
                    alt={`${hospital.name}.jpg`}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    priority
                  />
                </div>
              </div>
            </Marker>
          )
        })}

        {selectedHospital &&
        isFiniteCoord(selectedHospital.geometry.coordinates[0]) &&
        isFiniteCoord(selectedHospital.geometry.coordinates[1]) ? (
          <Popup
            key={selectedHospital.id}
            longitude={selectedHospital.geometry.coordinates[0]}
            latitude={selectedHospital.geometry.coordinates[1]}
            closeOnClick={false}
            className="relative min-w-0 w-[min(256px,calc(100vw-2rem))]"
            closeButton={false}
          >
            <div className="flex">
              <button
                type="button"
                onClick={() => {
                  setSelectedHospital(null)
                }}
              >
                <Icon
                  name="cross"
                  className="absolute right-1.5 top-1.5 size-4 min-w-4"
                />
              </button>
              <div className="relative min-h-20 min-w-24 w-24">
                <Image
                  fill
                  src={hospitalImageSrc(selectedHospital.imgSrc)}
                  alt={selectedHospital.name || "hospital"}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="rounded-md object-cover"
                />
              </div>
              <div className="my-auto ml-2 flex flex-col">
                <Link href={`/practices`}>
                  <h3 className="text-sm font-semibold leading-4 text-[--primary-black] opacity-80">
                    {selectedHospital.name}
                  </h3>
                </Link>
                <span className="text-start text-xs leading-3 opacity-80">
                  {selectedHospital.address}
                </span>
              </div>
            </div>
          </Popup>
        ) : null}
      </MapGL>

      {!disableResetBtn && (
        <Button type="outline" className="ml-auto mt-2" onClick={handleReset}>
          reset map
        </Button>
      )}
    </div>
  )
}
