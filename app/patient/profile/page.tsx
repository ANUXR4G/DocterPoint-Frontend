"use client"

import Image from "next/image"

import { format, parse } from "date-fns"

import { firey } from "@/utils"
import { TPatient } from "@/types"

import { useApi } from "@/hooks/useApi"

import { userService } from "@/lib/services/user"
import { patientService } from "@/lib/services/patient"

import { AlignContent, ProfileEditModal, ProfileSkeleton } from "@/components"

// Retrieve patient informations
export default function ProfilePage() {
  const { data: profile, isLoading } = useApi(
    ["users:profile"],
    async (_, token) => userService.profile(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TPatient,
    }
  )

  // Retrieve patient health record informations
  const { data: healthRecord } = useApi(
    [`patients:monitorings:${profile?.id}`],
    (_, token) => patientService.getPatientHealthRecord(token),
    {
      enabled: !!profile?.id,
    }
  )

  // Check if the medical infomations are empty
  const isMedicalEmpty = healthRecord && Array.isArray(healthRecord)

  // Show Profile Page Skeleton on Page Loading
  if (isLoading) return <ProfileSkeleton />

  return (
    <div className="flex flex-col max-w-4xl mx-auto divide-y dark:divide-neutral-500">
      {profile && (
        <div className="flex-col center p-4">
          {/* picture */}
          <div className="relative size-24 min-w-24 2xl:size-32 2xl:min-w-32 rounded-full ring-2 ring-sky-500 ring-offset-4">
            <Image
              fill
              src={
                profile.imgSrc ||
                `${`https://res.cloudinary.com/firey/image/upload/v1708816390/iub/${
                  profile.gender
                    ? profile.gender === `male`
                      ? `male`
                      : `female`
                    : `male`
                }_12.jpg`}`
              }
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              alt={`${profile.id}.jpg`}
              style={{ objectFit: "cover" }}
              priority
              className="rounded-full"
            />
            {/* overlay */}
            <div className="min-h-full min-w-full bg-black/25 absolute top-0 right-0 bottom-0 left-0 rounded-full" />
          </div>

          {/* profession and address */}
          <div className="mt-3 mb-1 center flex-col">
            {profile.profession && (
              <h4 className="text-sm font-bold opacity-90 leading-4">
                {profile.profession}
              </h4>
            )}
            {profile.address && (
              <h4 className="text-xs font-semibold opacity-80">
                {profile.address}
              </h4>
            )}
          </div>

          {/* edit option */}
          <div
            className={`${
              !profile.profession && !profile.address && `ml-auto`
            }`}
          >
            <ProfileEditModal />
          </div>
        </div>
      )}
      {/* basic informations */}
      <div className="flex flex-col p-4 gap-2">
        <h1 className="text-lg font-bold opacity-75 dark:text-neutral-200">
          Basic information
        </h1>
        <AlignContent
          keys={["Name", "Date Of Birth"]}
          values={[
            profile?.name || "Not Provided",
            profile?.dateOfBirth
              ? format(
                  parse(profile.dateOfBirth, "MM/dd/yyyy", new Date()),
                  "dd/MM/yyyy"
                ) // convert the mm/dd/yyyy formatted text into dd/mm/yyyy
              : `Not Provided`,
          ]}
        />
        <AlignContent
          keys={["Gender", "Profession"]}
          values={[
            profile?.gender || "Not Provided",
            profile?.profession || "Not Provided",
          ]}
        />
        <AlignContent
          keys={["Contact Number", "Emegency Contact"]}
          values={[
            profile?.contactNumber || "Not Provided",
            profile?.emergencyNumber || "Not Provided",
          ]}
        />
        <AlignContent
          keys={["Email", "Address"]}
          values={[
            profile?.email || "Not Provided",
            profile?.address || "Not Provided",
          ]}
          className="[&>div]:min-w-full flex-wrap lg:[&>div]:lg:min-w-max lg:flex-nowrap"
        />
      </div>

      {/* medical history */}
      <div className="mt-5 flex flex-col p-4 gap-2">
        <h1 className="text-lg font-bold opacity-75 dark:text-neutral-200">
          Medical History
        </h1>

        {/* medical options */}
        <AlignContent
          keys={["Weight", "Height"]}
          values={[
            !isMedicalEmpty
              ? healthRecord?.weight
                ? `${healthRecord.weight}lb`
                : `Not Provided`
              : `Not Provided`,
            !isMedicalEmpty
              ? healthRecord?.height
                ? `${healthRecord.height}ft`
                : `Not Provided`
              : `Not Provided`,
          ]}
        />
        <AlignContent
          keys={["Blood Group", "Smoking Status"]}
          values={[
            !isMedicalEmpty
              ? healthRecord?.blood_group
                ? `${healthRecord.blood_group}`
                : `Not Provided`
              : `Not Provided`,
            !isMedicalEmpty
              ? healthRecord?.smoking_status
                ? `${healthRecord.smoking_status}`
                : `Not Provided`
              : `Not Provided`,
          ]}
        />
        <AlignContent
          keys={["Physical Activity"]}
          values={[
            !isMedicalEmpty
              ? healthRecord?.physical_activity
                ? `${healthRecord.physical_activity}`
                : `Not Provided`
              : `Not Provided`,
          ]}
        />
        <AlignContent
          keys={["Previous Diabetes Record"]}
          values={[
            !isMedicalEmpty
              ? healthRecord?.previous_diabetes_records
                ? healthRecord.previous_diabetes_records.length > 1
                  ? firey.makeString(healthRecord.previous_diabetes_records)
                  : `Not Provided`
                : `Not Provided`
              : `Not Provided`,
          ]}
        />
      </div>
    </div>
  )
}
