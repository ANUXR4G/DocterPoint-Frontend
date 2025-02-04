"use client"

import React, { useState } from "react"
import { BasicInfo, Button, Icon, MedicalRecords, Modal } from "@/components"
import { useUpdateProfile } from "@/hooks/useUpdateProfile"

export default function ProfileEditModal() {
  const [openModal, setOpenModal] = useState<boolean>(false)

  const {
    values,
    infoKeys,
    isUploading,
    setValues,
    setImgFile,
    handleChange,
    handleSubmit,
    isInfoUpdating,
    isMedicalUpdating,
  } = useUpdateProfile(() => {
    console.log("info updated.")
    setOpenModal(false)
  })

  return (
    <React.Fragment>
      <button
        className="rounded-full flex items-center gap-1 border border-gray-300 py-1 px-3"
        onClick={() => setOpenModal(true)}
      >
        <Icon
          name="settings"
          className="size-4"
          pathClassName="stroke-neutral-600 dark:stroke-neutral-400"
        />
        <span className="text-sm font-semibold opacity-90">Edit</span>
      </button>
      <Modal
        open={openModal}
        handler={() => setOpenModal(false)}
        direction="center"
        secondaryBtn={
          <Button onClick={handleSubmit}>
            {isUploading || isInfoUpdating || isMedicalUpdating ? (
              <div className="size-5">
                <Icon name="spinning-loader" className="fill-orange-100" />
              </div>
            ) : (
              `Save Changes`
            )}
          </Button>
        }
        className="h-full sm:h-3/4 w-full max-w-[720px]"
      >
        <div className="flex flex-col gap-2 p-2 lg:p-4 overflow-x-hidden overflow-y-auto custom-scroll">
          {/* basic informations */}
          <BasicInfo
            values={values}
            setValues={setValues}
            handleChange={handleChange}
            setImgFile={setImgFile}
            infoKeys={infoKeys}
            enableModalMode
          />

          {/* health medical history */}
          <MedicalRecords
            values={values}
            setValues={setValues}
            handleChange={handleChange}
            infoKeys={infoKeys}
            enableModalMode
          />
        </div>
      </Modal>
    </React.Fragment>
  )
}
