"use client"

import Link from "next/link"
import Image from "next/image"
import { useQuery } from "react-query"
import React, { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { firey } from "@/utils"
import { TDoctor, THospital } from "@/types"
import { doctorServices } from "@/lib/services/doctor"
import { hospitalService } from "@/lib/services/hospital"

import {
  Modal,
  Map,
  Icon,
  Button,
  AppointmentModal,
  SuggestedDoctors,
  NoData,
  ChatModal,
} from "@/components"

const FALLBACK_DOCTOR_IMG =
  "https://res.cloudinary.com/firey/image/upload/v1708816390/iub/male_12.jpg"

function doctorImageSrc(src?: string | null) {
  const trimmed = src?.trim()
  return trimmed ? trimmed : FALLBACK_DOCTOR_IMG
}

export default function DoctorInfoPage() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const popup = searchParams.get("popup")

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [openContact, setOpenContact] = useState<boolean>(false)
  const [openAppointment, setOpenAppointment] = useState<boolean>(!!popup)

  const pathname = usePathname()
  const router = useRouter()

  // Retrieve the Doctor Informations
  const { data: information } = useQuery(
    [`doctors:info:${id}`],
    async () => {
      if (id) return doctorServices.getDoctorInfo(id)
    },
    {
      enabled: !!id,
      select: (data) => firey.convertKeysToCamelCase(data) as TDoctor, // restructure the response data,
    }
  )

  // Retrieve the Hospital Informations
  const { data: hospitalInfo } = useQuery(
    [`hospitals:info:${information?.hospital.id}`],
    async () => {
      if (information?.hospital) {
        return hospitalService.getHospitalInfo(information.hospital.id)
      }
    },
    {
      enabled: !!information,
      select: (data) => firey.convertKeysToCamelCase(data) as THospital,
    }
  )

  // Open Modal and Add Doctor Id to the query param
  function handleModalOpen() {
    if (!information) return
    setOpenAppointment(true)
    router.push(`${pathname}?id=${information.id}&popup=t`)
  }

  // Handle Modal close and also Update the query params
  function handleModalClose() {
    if (!information) return
    setOpenAppointment(false)
    router.replace(`/practices`)
  }

  // Doctor Not Found
  if (!id) return <NoData content="OOPS, Doctor Not Found." />

  // Loader Skeleton UI
  if (!information || !hospitalInfo) return <div />

  return (
    <React.Fragment>
      <div className="pt-4">
        <button
          className="absolute z-[5] top-20 right-3.5 center size-9 md:size-10 bg-neutral-200/60 rounded-xl hover:bg-neutral-200/100 dark:bg-neutral-700 dark:hover:bg-neutral-600 transition"
          onClick={() => setIsOpen(true)}
        >
          <Icon
            name="mail-upload"
            className="size-5 md:size-6 text-neutral-600 dark:text-neutral-200"
          />
        </button>
        {/* landing contents */}
        <div className="flex flex-col items-center md:gap-6">
          {/* doctor image */}
          <div className="relative size-24 shrink-0 rounded-full ring-2 ring-sky-500 ring-offset-4 md:size-56 md:min-w-56 md:rounded-lg lg:size-80 lg:min-w-80">
            <Image
              fill
              src={doctorImageSrc(information.imgSrc)}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              alt={`${information.name.toLowerCase().trim()}.jpg`}
              style={{ objectFit: "cover" }}
              priority
              className="rounded-full md:rounded-lg"
            />

            {/* overlay */}
            <div className="min-h-full min-w-full bg-black/25 absolute top-0 right-0 bottom-0 left-0 rounded-full md:rounded-lg" />
          </div>

          {/* doctor details */}
          <div className="mt-3 min-w-0 md:mt-0 md:w-full">
            <div className="flex flex-col items-center text-center">
              <h3 className="break-words text-base font-bold">{information.name}</h3>
              <p className="text-sm font-semibold leading-tight text-cyan-900 opacity-70 line-clamp-3 dark:text-neutral-400">
                {information.description}
              </p>
              <Link
                href={`/practices`}
                className="mt-1 break-words text-sm font-semibold opacity-80"
              >
                {information.hospital.name}
              </Link>

              {/* location with icon */}
              <Link
                href="/practices"
                className="-ml-1 flex items-center opacity-80"
              >
                <Icon name="pin" className="size-5" />
                <span className="ml-1 text-sm font-semibold">
                  {information.hospital.city}
                </span>
              </Link>
            </div>

            <div className="mx-auto mt-4 flex max-w-96 items-center gap-3 md:mt-5 md:gap-4">
              {/* experice */}
              <div className="w-1/3 rounded-lg border px-2 py-8 text-center dark:border-neutral-500 xxs:px-4 md:px-5">
                <h5 className="mb-[-0.5rem] text-base font-bold leading-tight xxs:text-lg">
                  {information.experience} years+
                </h5>
                <span className="text-xs font-semibold xxs:text-sm">
                  Experience
                </span>
              </div>

              {/* consult controls */}
              <div className="flex w-2/3 flex-col gap-2">
                <Button className="center py-4" onClick={handleModalOpen}>
                  Consult online
                </Button>
                <Button
                  className="center py-3"
                  onClick={() => setOpenContact(true)}
                >
                  Call for booking
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* hospital details */}
        <div className="mt-6 mb-2">
          <h3 className="text-lg font-bold opacity-90">Hospital details</h3>
          <p className="text-sm leading-tight">
            {information.hospital.address}
          </p>
        </div>

        {/* hospital map display */}
        {hospitalInfo && (
          <React.Fragment>
            {/* map */}
            <Map
              hospitals={[hospitalInfo]}
              coordinates={hospitalInfo.geometry.coordinates}
            />

            {/* doctors from same hospital */}
            <div>
              <SuggestedDoctors
                hospitalId={information.hospital.id}
                doctorIds={[information.id]}
              >
                <h1 className="text-2xl text-center lg:text-4xl max-w-[778px] font-bold opacity-90 ml-2 mt-5 mb-4 lg:mx-auto lg:font-extrabold lg:mb-6 lg:mt-10">
                  More doctors from{" "}
                  <span className="bg-gradient-to-r from-blue-800 to-indigo-900 bg-clip-text text-transparent dark:from-indigo-500 dark:to-blue-500">
                    {information.hospital.name}
                  </span>
                </h1>
              </SuggestedDoctors>
            </div>

            {/* top rated doctors */}
            <div className="mt-6">
              <SuggestedDoctors experience={6} doctorIds={[information.id]}>
                <h1 className="flex gap-2 text-2xl lg:text-3xl leading-tight font-bold opacity-90 ml-2 mb-1">
                  Top rated x{" "}
                  <span className="bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent">
                    GlucoGuide{" "}
                  </span>
                </h1>
              </SuggestedDoctors>
            </div>
          </React.Fragment>
        )}
      </div>

      {/* Appointment Booking Modal */}
      <AppointmentModal
        active={openAppointment}
        closeHandler={handleModalClose}
        doctor={information}
        type="profile"
      />

      {/* Contact information Modal UI */}
      <Modal
        className="w-full max-w-[420px] center"
        open={openContact}
        handler={() => setOpenContact(false)}
        direction="center"
        disableDivider={true}
      >
        <div className="h-full center flex-col w-56 space-y-3">
          {information.contactNumbers.map((contact, idx) => (
            <Button
              key={`doctor-${id}-contact-${idx}`}
              className="w-full center py-3"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.open(`tel:${contact}`)
                }
              }}
            >
              <Icon name="phone" className="size-5" />
              <span>{contact}</span>
            </Button>
          ))}
        </div>
      </Modal>

      {/* Chat with doctor  */}
      {isOpen && (
        <ChatModal
          isOpen={isOpen}
          toggleChat={() => setIsOpen(false)}
          receiverId={information.id}
        />
      )}
    </React.Fragment>
  )
}
