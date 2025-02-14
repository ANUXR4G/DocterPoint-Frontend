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
    router.replace(`/hospitals/doctors/info?id=${information.id}`)
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
          <div className="relative size-24 min-w-24 md:size-56 lg:size-80 md:min-w-56 lg:min-w-80 rounded-full md:rounded-lg ring-2 ring-sky-500 ring-offset-4">
            <Image
              fill
              src={information.imgSrc}
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
          <div className="mt-3 md:mt-0 md:w-full">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-base font-bold">{information.name}</h3>
              <p className="text-sm font-semibold text-cyan-900 dark:text-neutral-400 opacity-70  leading-tight line-clamp-3">
                {information.description}
              </p>
              <Link
                href={`/hospitals/${information.hospital.id}/info`}
                className="text-sm mt-1 font-semibold opacity-80"
              >
                {information.hospital.name}
              </Link>

              {/* location with icon */}
              <Link
                href={{
                  pathname: "/hospitals/doctors",
                  query: { location: information.hospital.city },
                }}
                className="flex items-center -ml-1 opacity-80"
              >
                <Icon name="pin" className="size-5" />
                <span className="ml-1 text-sm font-semibold">
                  {information.hospital.city}
                </span>
              </Link>
            </div>

            <div className="flex gap-3 md:gap-4 items-center mt-4 md:mt-5 max-w-96 mx-auto">
              {/* experice */}
              <div className="w-1/3 border dark:border-neutral-500 px-2 py-8 xxs:px-4 md:px-5 rounded-lg text-center">
                <h5 className="text-base text-nowrap xxs:text-lg font-bold -mb-2">
                  {information.experience} years+
                </h5>
                <span className="text-xs xxs:text-sm font-semibold">
                  Experience
                </span>
              </div>

              {/* consult controls */}
              <div className="flex flex-col gap-2 w-2/3">
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
