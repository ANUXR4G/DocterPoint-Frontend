"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

import {
  BasicInfo,
  MedicalRecords,
  Button,
  PatientInfoSkeleton,
  Icon,
} from "@/components"
import { useRouter } from "next/navigation"
import { useUpdateProfile } from "@/hooks/useUpdateProfile"

export default function InfoForm() {
  const [allowNext, setAllowNext] = useState<boolean>(false)

  const router = useRouter()

  // handle skip
  function handleSkip() {
    if (!allowNext) {
      setAllowNext(true)
      return
    }

    router.push("/patient/dashboard")
  }

  const {
    profile,
    values,
    infoKeys,
    imgFile,
    isUploading,
    setValues,
    setImgFile,
    handleChange,
    handleSubmit,
    isInfoLoading,
    isInfoUpdating,
    isMedicalUpdating,
  } = useUpdateProfile()

  function handleConfirm() {
    if (allowNext) {
      handleSubmit()
    }

    setAllowNext(true)
  }

  // redirect to patient dashboard if date of birth already provided
  useEffect(() => {
    if (profile && profile.dateOfBirth) {
      router.push("/patient/dashboard")
    }
  }, [profile, router])

  // show skeleton while retrieve profile info
  if (isInfoLoading) return <PatientInfoSkeleton />

  return (
    <div className="w-full center flex-col max-w-3xl 2xl:max-w-4xl 2xl:mt-4">
      <div className="size-full flex flex-col overflow-hidden">
        <motion.div
          animate={{ x: allowNext ? "-100%" : "0" }}
          className="relative size-full flex"
        >
          {/* basic information section */}
          <BasicInfo
            values={values}
            setValues={setValues}
            handleChange={handleChange}
            setImgFile={setImgFile}
            infoKeys={infoKeys}
            allowNext={allowNext}
          />

          {/* medical history details */}
          {allowNext && (
            <MedicalRecords
              values={values}
              setValues={setValues}
              handleChange={handleChange}
              infoKeys={infoKeys}
              allowNext={allowNext}
              handleGoBack={() => setAllowNext(false)}
            />
          )}
        </motion.div>

        {/* section controls */}
        <div
          className={`ml-auto flex mr-3 space-x-2 pb-4 ${
            allowNext ? `mt-8` : `mt-32`
          }`}
        >
          <Button
            type="outline"
            onClick={handleSkip}
            className="min-w-24 center 2xl:text-base"
          >
            Skip
          </Button>
          <Button
            onClick={handleConfirm}
            className="min-w-24 center 2xl:text-base"
          >
            {allowNext ? (
              isUploading || isInfoUpdating || isMedicalUpdating ? (
                <div className="size-5">
                  <Icon name="spinning-loader" className="fill-orange-100" />
                </div>
              ) : (
                `Save Update`
              )
            ) : (
              `Next`
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
