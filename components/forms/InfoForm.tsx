"use client"

import { useCallback, useEffect, useState } from "react"
import { TInfoOptions, TPatient } from "@/types"
import { useForm } from "@/hooks/useForm"
import { motion } from "framer-motion"

import {
  BasicInfo,
  MedicalRecords,
  Button,
  PatientInfoSkeleton,
  Icon,
} from "@/components"
import { useCloudinary } from "@/hooks/useCloudinary"
import { useApi } from "@/hooks/useApi"
import { firey } from "@/utils"
import { patientService } from "@/lib/services/patient"
import { userService } from "@/lib/services/user"
import { useApiMutation } from "@/hooks/useApiMutation"
import { queryClient } from "@/app/providers"
import { format } from "date-fns"
import { useRouter } from "next/navigation"

const initialValues: TInfoOptions = {
  name: "",
  dateOfBirth: null,
  imgSrc: "",
  gender: "male",
  profession: "",
  contactNumber: "",
  emergencyNumber: "",
  address: "",
  weight: "",
  height: "",
  bloodGroup: "A+",
  smokingStatus: "None Smoker",
  physicalActivity: "Moderate",
  previousDiabetesRecords: [],
}

export default function InfoForm() {
  const [allowNext, setAllowNext] = useState<boolean>(false)
  const [confirmSubmission, setConfirmSubmission] = useState<boolean>(false)
  const [imgFile, setImgFile] = useState<File | null>(null)

  const infoKeys = Object.keys(initialValues) // get all the key fields from the inital values

  // upload image to cloudinary
  const { isUploading, isUploaded, handleImgUpload } = useCloudinary(
    imgFile,
    (imgSrc) => {
      setValues((prev) => ({ ...prev, imgSrc }))
    }
  )

  const router = useRouter()

  const { values, setValues, handleChange } = useForm({
    initialValues,
    onSubmit: () => {},
  })

  // retrieve patient informations
  const { data: profile, isLoading } = useApi(
    ["users:profile"],
    async (_, token) => userService.profile(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TPatient,
      onSuccess: (data) => {
        // update the form values
        setValues((prev) => ({
          ...prev,
          name: data?.name || "",
          dateOfBirth: data?.dateOfBirth ? new Date(data.dateOfBirth) : null,
          imgSrc: data?.imgSrc || "",
          gender: data?.gender || "male",
          profession: data?.profession || "",
          contactNumber: data?.contactNumber || "",
          emergencyNumber: data?.emergencyNumber || "",
          address: data?.address || "",
        }))
      },
      staleTime: 0,
    }
  )

  // retrieve patient health record informations
  const { data: healthRecord } = useApi(
    [`patients:monitorings:${profile?.id}`],
    (_, token) => patientService.getPatientHealthRecord(token),
    {
      enabled: !!profile?.id,
      onSuccess: (data) => {
        if (!Array.isArray(data)) {
          setValues((prev) => ({
            ...prev,
            weight: data.weight || "",
            height: data.height || "",
            bloodGroup: data.blood_group || "A+",
            previousDiabetesRecords: data.previous_diabetes_records || [],
            smokingStatus: data.smoking_status || "None Smoker",
            physicalActivity: data.physical_activity || "Moderate",
          }))
        }
      },
      staleTime: 0,
    }
  )

  // mutation for updating patient informations
  const {
    mutate: profileMutation,
    isLoading: profileMutationLoading,
    isSuccess: profileSuccess,
  } = useApiMutation<{
    payload: Record<string, unknown>
  }>(({ payload }, token) => userService.update(token, payload), {
    onSuccess: () => {
      if (profile) {
        queryClient.invalidateQueries(`users:profile`)
      }
    },
  })

  // mutation for updating patient health record
  const {
    mutate: healthRecordMutation,
    isLoading: recordMutationLoading,
    isSuccess: recordSuccess,
  } = useApiMutation<{
    payload: Record<string, unknown>
  }>(
    ({ payload }, token) => {
      if (!healthRecord) throw new Error("required informations are missing.")
      // handle new record
      if (Array.isArray(healthRecord)) {
        return patientService.createPatientHealthRecord(token, payload)
      } else {
        // update record
        return patientService.updatePatientHealthRecord(
          token,
          payload,
          healthRecord.id
        )
      }
    },
    {
      onSuccess: () => {
        if (profile) {
          queryClient.invalidateQueries(`patients:monitorings:${profile.id}`)
        }
      },
    }
  )

  // handle go back
  function handleGoBack() {
    setAllowNext(false)
  }

  // handle skip
  function handleSkip() {
    if (!allowNext) {
      setAllowNext(true)
      return
    }

    router.push("/patient/dashboard")
  }

  // reconstruct payload so that it only sends the updated data as payload (if the data is same as stored it will avoid it)
  const getPayloads = useCallback(
    function () {
      // assign date of birth based on its existence from the retrieve data
      const dateOfBirth = profile?.dateOfBirth
        ? format(profile.dateOfBirth, "MM/dd/yyyy") !==
            (values.dateOfBirth && format(values.dateOfBirth, "MM/dd/yyyy")) &&
          values.dateOfBirth && {
            date_of_birth: format(values.dateOfBirth, "MM/dd/yyyy"),
          }
        : values.dateOfBirth && {
            date_of_birth: format(values.dateOfBirth, "MM/dd/yyyy"),
          }

      // reconstruct the info payload based on its existence from the retrieve data
      const infoPayload = {
        ...(profile?.name !== values.name &&
          values.name.length !== 0 && { name: values.name }),
        ...(imgFile && { imgSrc: values.imgSrc }),
        ...(dateOfBirth && dateOfBirth),
        ...(profile?.profession !== values.profession &&
          values.profession.length !== 0 && {
            profession: values.profession,
          }),
        ...(profile?.contactNumber !== values.contactNumber &&
          values.contactNumber.length !== 0 && {
            contact_number: values.contactNumber,
          }),
        ...(profile?.emergencyNumber !== values.emergencyNumber &&
          values.emergencyNumber.length !== 0 && {
            emergency_number: values.emergencyNumber,
          }),
        ...(profile?.address !== values.address &&
          values.address.length !== 0 && { address: values.address }),
        ...(profile?.gender !== values.gender && { gender: values.gender }),
      }

      // reconstruct previous diabetes history
      const previousDiabetesRecords =
        healthRecord &&
        !Array.isArray(healthRecord) &&
        healthRecord.previous_diabetes_records
          ? healthRecord.previous_diabetes_records.every(
              (item) => !values.previousDiabetesRecords.includes(item)
            )
            ? values.previousDiabetesRecords
            : []
          : values.previousDiabetesRecords.length >= 1
          ? values.previousDiabetesRecords
          : []

      const recordPayload = {
        // weight
        ...(healthRecord && !Array.isArray(healthRecord)
          ? (healthRecord.weight || "") !== values.weight && {
              weight: values.weight,
            }
          : String(values.weight).length !== 0 && {
              weight: values.weight,
            }),

        // height
        ...(healthRecord && !Array.isArray(healthRecord)
          ? (healthRecord.height || "") !== values.height && {
              height: values.height,
            }
          : String(values.height).length !== 0 && {
              height: values.height,
            }),

        //  blood group
        ...(healthRecord && !Array.isArray(healthRecord)
          ? (healthRecord.blood_group || "") !== values.bloodGroup && {
              blood_group: values.bloodGroup,
            }
          : {
              blood_group: values.bloodGroup,
            }),

        // previous diabetes records
        ...(previousDiabetesRecords.length !== 0 && {
          previous_diabetes_records: values.previousDiabetesRecords,
        }),

        // smoking status
        ...(healthRecord && !Array.isArray(healthRecord)
          ? (healthRecord.smoking_status || "") !== values.smokingStatus && {
              smoking_status: values.smokingStatus,
            }
          : {
              smoking_status: values.smokingStatus,
            }),

        // physical activity status
        ...(healthRecord && !Array.isArray(healthRecord)
          ? (healthRecord.physical_activity || "") !==
              values.physicalActivity && {
              physical_activity: values.physicalActivity,
            }
          : {
              physical_activity: values.physicalActivity,
            }),
      }

      return { infoPayload, recordPayload }
    },
    [profile, healthRecord, values, imgFile]
  )

  function handleConfirmation() {
    if (allowNext) {
      imgFile && handleImgUpload()
      setConfirmSubmission(true)
    }

    setAllowNext(true)
  }

  // handle updating basic info and medical history
  useEffect(() => {
    if (
      (imgFile && isUploaded && confirmSubmission) ||
      (!imgFile && confirmSubmission)
    ) {
      // reconstruct payload based on conditions
      const { infoPayload, recordPayload } = getPayloads()

      // update profile informations if user filled the info
      if (Object.keys(infoPayload).length >= 1) {
        profileMutation({ payload: infoPayload })
      }

      // create new or update existing medical history record
      if (Object.keys(recordPayload).length >= 1) {
        healthRecordMutation({ payload: recordPayload })
      }
    }
  }, [
    imgFile,
    isUploaded,
    confirmSubmission,
    healthRecordMutation,
    profileMutation,
    getPayloads,
  ])

  // redirect to patient dashboard if date of birth already provided
  useEffect(() => {
    if ((profile && profile.dateOfBirth) || profileSuccess || recordSuccess) {
      router.push("/patient/dashboard")
    }
  }, [profile, router, recordSuccess, profileSuccess])

  // show skeleton while retrieve profile info
  if (isLoading) return <PatientInfoSkeleton />

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
              handleGoBack={handleGoBack}
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
            onClick={handleConfirmation}
            className="min-w-24 center 2xl:text-base"
          >
            {allowNext ? (
              isUploading || profileMutationLoading || recordMutationLoading ? (
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
