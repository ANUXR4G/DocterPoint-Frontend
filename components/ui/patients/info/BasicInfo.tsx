"use client"

import Image from "next/image"
import React, { useState } from "react"
import { motion } from "framer-motion"
import { BasicSelect, DatePicker, Input, Icon } from "@/components"
import { firey } from "@/utils"
import { TInfoOptions } from "@/types"

type Props = {
  values: TInfoOptions
  setValues: React.Dispatch<React.SetStateAction<TInfoOptions>>
  handleChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => void
  setImgFile: React.Dispatch<React.SetStateAction<File | null>>
  infoKeys: string[]
  allowNext?: boolean
  enableModalMode?: boolean
}

export default function BasicInfo({
  values,
  setValues,
  setImgFile,
  handleChange,
  infoKeys,
  allowNext,
  enableModalMode = false,
}: Props) {
  const [imgBlob, setImgBlob] = useState<string | null>(null)

  // handle image input change
  function handleImgChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return // if was cancelled

    try {
      const blob = new Blob([e.target.files[0]])
      const blobURL = URL.createObjectURL(blob)
      setImgBlob(blobURL)
      setImgFile(e.target.files[0])
    } catch (err) {
      throw new Error(`failed to generate image blob.`)
    }
  }

  // handle day selection
  function handleDayChange(day: Date) {
    setValues((prev) => ({ ...prev, dateOfBirth: day }))
  }

  return (
    <React.Fragment>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: !!allowNext ? 0 : 1 }}
        className="min-w-full mt-5 w-full flex flex-col"
      >
        {/* profile picture */}
        <div className="flex mx-auto">
          <div className="relative size-24 min-w-24 2xl:size-32 2xl:min-w-32 rounded-full ring-2 ring-sky-500 ring-offset-4 group">
            <Image
              fill
              src={
                imgBlob
                  ? imgBlob
                  : values.imgSrc.length !== 0
                  ? values.imgSrc
                  : `${`https://res.cloudinary.com/firey/image/upload/v1708816390/iub/${
                      values.gender === `male` ? `male` : `female`
                    }_12.jpg`}`
              }
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              alt={`pp__upload.jpg`}
              style={{ objectFit: "cover" }}
              priority
              className="rounded-full"
            />
            {/* overlay */}
            <div className="min-h-full min-w-full bg-black/25 absolute top-0 right-0 bottom-0 left-0 rounded-full" />
            <button
              tabIndex={1}
              className="absolute bottom-0 right-0 size-7 center rounded-full bg-neutral-800/25 contrast-75 backdrop-blur-sm focus:outline focus:outline-2 focus:outline-blue-400"
            >
              <Icon
                name="settings"
                className="size-5"
                pathClassName="stroke-neutral-100 dark:stroke-neutral-300"
              />
              <input
                type="file"
                name="profile_picture_file_reader"
                className="absolute left-0 opacity-0 w-7"
                onChange={handleImgChange}
              />
            </button>
          </div>
        </div>

        {/* basics informations */}
        <div
          className={`p-2 w-full mt-3 flex flex-col gap-2 ${
            enableModalMode && `divide-y dark:divide-neutral-500`
          }`}
        >
          <h1
            className={`text-lg ${
              !enableModalMode && `2xl:text-2xl`
            } mt-2 font-bold opacity-75 dark:text-neutral-200`}
          >
            Basic information
          </h1>

          {/* basic info options */}
          <div
            className={`grid grid-cols-2 gap-x-4 ${
              enableModalMode
                ? `pt-3 2xl:pt-5 gap-y-2.5`
                : `gap-y-3 2xl:gap-y-4`
            }`}
          >
            <Input
              name={infoKeys[0]}
              value={values.name}
              onChange={handleChange}
              autoComplete="new-name"
              tabIndex={2}
              placeholder="John Doe"
              className={enableModalMode ? `2xl:h-8` : `2xl:text-base`}
            />

            <DatePicker
              name={infoKeys[1]}
              selectedDay={values.dateOfBirth}
              onChange={handleDayChange}
              containerClassName={
                enableModalMode ? `mt-[3px]` : `2xl:[&_span]:text-base`
              }
              modalClassName="right-2"
              containerProps={{ tabIndex: 3 }}
            />

            <BasicSelect
              name="Gender"
              values={["male", "female", "others"]}
              onChange={handleChange}
              selected={values.gender}
              props={{ tabIndex: 4 }}
              className={`${!enableModalMode && `2xl:[&_select]:text-base`}`}
            />

            <Input
              name={infoKeys[4]}
              value={values.profession}
              onChange={handleChange}
              autoComplete="off"
              containerClassName="-mt-[3px]"
              tabIndex={5}
              placeholder="Accountant"
              className={enableModalMode ? `2xl:h-8` : `2xl:text-base`}
            />

            <Input
              name={infoKeys[5]}
              type="number"
              value={values.contactNumber}
              onChange={handleChange}
              autoComplete="new-contact"
              tabIndex={6}
              placeholder="01883999999"
              className={enableModalMode ? `2xl:h-8` : `2xl:text-base`}
            />

            <Input
              name={infoKeys[6]}
              type="number"
              value={values.emergencyNumber}
              onChange={handleChange}
              autoComplete="off"
              tabIndex={7}
              placeholder="01993888888"
              className={enableModalMode ? `2xl:h-8` : `2xl:text-base`}
            />

            {/* address */}
            <fieldset className="col-span-2">
              <legend className="font-semibold text-xs xxs:text-sm opacity-90">
                {firey.camelToCapitalize(infoKeys[7])}
              </legend>
              <textarea
                tabIndex={8}
                rows={3}
                className={`-ml-0.5 mt-0.5 p-2 w-full text-sm ${
                  !enableModalMode && `2xl:text-base`
                } text-neutral-600 dark:text-neutral-400 bg-transparent rounded-sm font-medium outline outline-1 outline-neutral-300 dark:outline-neutral-600 focus:outline-blue-400 resize-none`}
                placeholder="Write your address here..."
                name={infoKeys[7]}
                value={values.address}
                autoComplete="new-address"
                onChange={handleChange}
              />
            </fieldset>
          </div>
        </div>
      </motion.div>
    </React.Fragment>
  )
}
