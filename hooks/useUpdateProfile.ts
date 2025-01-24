import { TInfoOptions, TPatient, TPatientHealth } from "@/types"
import { useCallback, useEffect, useState } from "react"
import { useCloudinary } from "./useCloudinary"
import { useForm } from "./useForm"
import { useApi } from "./useApi"
import { userService } from "@/lib/services/user"
import { firey } from "@/utils"
import { patientService } from "@/lib/services/patient"
import { useApiMutation } from "./useApiMutation"
import { queryClient } from "@/app/providers"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

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

export function useUpdateProfile(onSuccess?: () => void | Promise<void>) {
  const [isReady, setIsReady] = useState<boolean>(false)
  const [imgFile, setImgFile] = useState<File | null>(null)

  const infoKeys = Object.keys(initialValues) // get all the key fields from the inital values

  const router = useRouter()

  const { values, setValues, handleChange } = useForm({
    initialValues,
    onSubmit: () => {},
  })

  const { isUploading, handleImgUpload } = useCloudinary(imgFile)

  // retrieve patient informations
  const { data: profile, isLoading: isInfoLoading } = useApi(
    ["users:profile"],
    async (_, token) => userService.profile(token),
    {
      // transform the values to have keys with camel casing
      select: (data) => firey.convertKeysToCamelCase(data) as TPatient,
      onSuccess: (data) => {
        const filteredValues = firey.filterNullValues(data) // remove all the null values

        setValues((prev) => ({
          ...prev,
          ...filteredValues,
          dateOfBirth: data?.dateOfBirth ? new Date(data.dateOfBirth) : null,
        }))
      },
      staleTime: 0, // keep it alive
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
    mutate: updateProfile,
    isLoading: isInfoUpdating,
    isSuccess: isInfoSuccess,
  } = useApiMutation<{
    payload: Record<string, unknown>
  }>(({ payload }, token) => userService.update(token, payload), {
    onSuccess: () => queryClient.invalidateQueries(`users:profile`),
  })

  // mutation for updating patient health record
  const {
    mutate: updateMedicalHistory,
    isLoading: isMedicalUpdating,
    isSuccess: isMedicalSuccess,
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
      onSuccess: () =>
        queryClient.invalidateQueries(`patients:monitorings:${profile?.id}`),
    }
  )

  // check for the changes in the values by comparing w the retrieved values
  const hasChanged = <
    K extends keyof (TPatient | TPatientHealth) & TInfoOptions
  >(
    value: ((TPatient | TPatientHealth) & TInfoOptions)[K],
    original: ((TPatient | TPatientHealth) & TInfoOptions)[K]
  ) => {
    return (
      value !== original &&
      value !== undefined &&
      !(typeof value === "string" && value.length === 0)
    )
  }

  // reconstruct payload so that it only sends the updated data as payload (if the data is same as stored it will avoid it)
  const getPayloads = useCallback(() => {
    const formatDate = (date: Date | null) =>
      date ? format(date, "MM/dd/yyyy") : undefined

    const dateOfBirth = hasChanged(
      formatDate(values.dateOfBirth),
      profile?.dateOfBirth
        ? formatDate(new Date(profile.dateOfBirth))
        : undefined
    )

    const infoPayload = {
      ...(hasChanged(values.name, profile?.name) && { name: values.name }),
      ...(imgFile && { img_src: values.imgSrc }),
      ...(hasChanged(values.gender, profile?.gender) && {
        gender: values.gender,
      }),
      ...(dateOfBirth && { date_of_birth: formatDate(values.dateOfBirth) }),
      ...(hasChanged(values.profession, profile?.profession) && {
        profession: values.profession,
      }),
      ...(hasChanged(values.contactNumber, profile?.contactNumber) && {
        contact_number: values.contactNumber,
      }),
      ...(hasChanged(values.emergencyNumber, profile?.emergencyNumber) && {
        emergency_number: values.emergencyNumber,
      }),
      ...(hasChanged(values.address, profile?.address) && {
        address: values.address,
      }),
    }

    const medicalPayload = {
      ...(healthRecord &&
        hasChanged(
          values.weight,
          !Array.isArray(healthRecord) ? healthRecord.weight : ""
        ) && {
          weight: values.weight,
        }),

      ...(healthRecord &&
        hasChanged(
          values.height,
          !Array.isArray(healthRecord) ? healthRecord.height : ""
        ) && {
          height: values.height,
        }),

      ...(healthRecord &&
        hasChanged(
          values.bloodGroup,
          !Array.isArray(healthRecord) ? healthRecord.blood_group : ""
        ) && {
          blood_group: values.bloodGroup,
        }),

      ...(healthRecord &&
        values.previousDiabetesRecords.length >= 1 &&
        JSON.stringify(values.previousDiabetesRecords) !==
          JSON.stringify(
            (!Array.isArray(healthRecord) &&
              healthRecord.previous_diabetes_records) ||
              []
          ) && {
          previous_diabetes_records: values.previousDiabetesRecords,
        }),

      ...(healthRecord &&
        hasChanged(
          values.smokingStatus,
          !Array.isArray(healthRecord) ? healthRecord.smoking_status : ""
        ) && {
          smoking_status: values.smokingStatus,
        }),

      ...(healthRecord &&
        hasChanged(
          values.physicalActivity,
          !Array.isArray(healthRecord) ? healthRecord.physical_activity : ""
        ) && {
          physical_activity: values.physicalActivity,
        }),
    }

    return { infoPayload, medicalPayload }
  }, [imgFile, values, profile, healthRecord])

  // handle updating basic info and medical history
  useEffect(() => {
    if (isReady) {
      // reconstruct payload based on conditions
      const { infoPayload, medicalPayload } = getPayloads()

      // update profile informations if user filled the info
      if (Object.keys(infoPayload).length >= 1) {
        updateProfile({ payload: infoPayload })
      }

      // create new or update existing medical history record
      if (Object.keys(medicalPayload).length >= 1) {
        updateMedicalHistory({ payload: medicalPayload })
      }

      onSuccess && onSuccess()
      setIsReady(false)
    }
  }, [isReady, getPayloads, onSuccess, updateProfile, updateMedicalHistory])

  async function handleSubmit() {
    if (imgFile) {
      const result = await handleImgUpload()
      setValues((prev) => ({ ...prev, imgSrc: result.secure_url }))
      setIsReady(true)
    } else {
      setIsReady(true)
    }
  }

  return {
    profile,
    healthRecord,
    values,
    imgFile,
    setValues,
    setImgFile,
    handleChange,
    infoKeys,
    handleSubmit,
    isUploading,
    isInfoLoading,
    isInfoUpdating,
    isMedicalUpdating,
  }
}
