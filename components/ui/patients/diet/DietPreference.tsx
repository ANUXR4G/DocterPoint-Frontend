"use client"

import React, { useEffect, useRef, useState } from "react"
import { Button, Checkbox, Icon, Modal, PopoverModal } from "@/components"
import {
  allergyOpts,
  cookingPreferenceOpts,
  cusineOpts,
  diertaryPreferenceOpts,
  generalPurposeOpt,
  healthGoalOpts,
  ingredientPreferenceOpts,
} from "@/lib/dummy/preferences"
import { useProfile } from "@/hooks/useProfile"
import { useApi } from "@/hooks/useApi"
import { patientService } from "@/lib/services/patient"
import { firey } from "@/utils"
import { TMedications } from "@/types"
import { useApiMutation } from "@/hooks/useApiMutation"
import { queryClient } from "@/app/providers"
import { useRouter } from "next/navigation"
import { usePathname, useSearchParams } from "next/navigation"

type OptionProps = {
  generalPurpose: string[]
  healthGoals: string[]
  diertaryPreferences: string[]
  foodAllergies: string[]
  foodAvoidanecs: string[]
  ingredientPreferences: string[]
  cusinePreferences: string
}

const initialPreferences: OptionProps = {
  generalPurpose: ["Regular Meals"],
  healthGoals: [],
  diertaryPreferences: [],
  foodAllergies: [],
  foodAvoidanecs: [],
  ingredientPreferences: [],
  cusinePreferences: "",
}

export default function DietPreferences() {
  const [active, setActive] = useState<boolean>(false)
  const hasRun = useRef(false)

  const [values, setValues] = useState<OptionProps>({
    ...initialPreferences,
  })

  const router = useRouter()
  const pathName = usePathname()
  const searchParams = useSearchParams()

  const isEmpty = Object.values(values).flatMap((item) => item).length === 0

  // retrieve medication details
  const { data: profile } = useProfile()
  const { data: suggestions } = useApi(
    [`patients:medications:${profile?.id}`],
    (_, token) => patientService.getMedications(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TMedications | [],
    }
  )

  // geenrate suggestions if no medication record was found
  const { mutate } = useApiMutation<{
    payload: Record<string, number>
  }>(
    ({ payload }, token) => patientService.generateSuggestions(token, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(`patients:medications:${profile?.id}`)
      },
    }
  )

  // update medication preferences if already exists
  const { mutate: updateMutate } = useApiMutation<{
    payload: Record<string, unknown>
  }>(({ payload }, token) => patientService.updateMedications(token, payload), {
    onSuccess: () => {
      queryClient.invalidateQueries(`patients:medications:${profile?.id}`)
      // invalidate old query keys to refetch the meal list again
      const queryKeys = queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey)
      queryKeys.forEach((key) => {
        if (Array.isArray(key) && key[0].startsWith("patients:meals")) {
          queryClient.invalidateQueries(key)
        }
      })
    },
  })

  function handleModalClose() {
    setActive(false)
  }

  function handleOpenModal() {
    setActive(true)
  }

  function handleReset() {
    if (suggestions && !Array.isArray(suggestions)) {
      setValues((prev) => ({
        ...initialPreferences,
        foodAllergies: suggestions.allergies ? suggestions.allergies : [],
        ingredientPreferences: suggestions.recommendedIngredients
          ? suggestions.recommendedIngredients
          : [],
      }))
    } else {
      setValues(initialPreferences)
    }
  }

  // handle general purpose selection
  function handleGeneralPurposes(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value
      const exist = prev.generalPurpose.includes(value)
      const newPurposes = exist
        ? prev.generalPurpose.filter((item) => item !== value)
        : prev.generalPurpose.concat(value)
      return { ...prev, generalPurpose: newPurposes }
    })
  }

  // handle dietary preference selection
  function handleDietaryPreferences(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value
      const exist = prev.diertaryPreferences.includes(value)
      const newPreferences = exist
        ? prev.diertaryPreferences.filter((item) => item !== value)
        : prev.diertaryPreferences.concat(value)
      return { ...prev, diertaryPreferences: newPreferences }
    })
  }

  // handle health goals selection
  function handleHealthGoals(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value
      const exist = prev.healthGoals.includes(value)
      const newGoals = exist
        ? prev.healthGoals.filter((item) => item !== value)
        : prev.healthGoals.concat(value)
      return { ...prev, healthGoals: newGoals }
    })
  }

  // handle food allergies selection
  function handleFoodAllergies(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value.toLowerCase()
      const exist = prev.foodAllergies.includes(value)
      const newAllergies = exist
        ? prev.foodAllergies.filter((item) => item !== value)
        : prev.foodAllergies.concat(value)
      return { ...prev, foodAllergies: newAllergies }
    })
  }

  // handle ingredient preferences selection
  function handleIngredients(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value.toLowerCase()
      const exist = prev.ingredientPreferences.includes(value)
      const newIngredients = exist
        ? prev.ingredientPreferences.filter((item) => item !== value)
        : prev.ingredientPreferences.concat(value)
      return { ...prev, ingredientPreferences: newIngredients }
    })
  }

  // handle cusine preferences selection
  function handleCusinePref(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => {
      const value = e.target.value
      const cuisineAlreadyExists = prev.cusinePreferences === value
      return { ...prev, cusinePreferences: cuisineAlreadyExists ? "" : value }
    })
  }

  // handle preferences confirmation
  function handleConfirm() {
    const payload = {
      allergies: values.foodAllergies.length > 0 ? values.foodAllergies : [],
      recommended_ingredients:
        values.ingredientPreferences.length > 0
          ? values.ingredientPreferences
          : [],

      preferred_cuisine: values.cusinePreferences,
    }

    // update patients diet preferences
    const payloadSize = Object.keys(payload).length
    if (payloadSize > 0) {
      updateMutate({ payload })
    }

    // close the modal
    handleModalClose()
  }

  // automatically generate suggestions based on age
  useEffect(() => {
    if (hasRun.current) return
    if (!profile?.dateOfBirth || !suggestions) return
    const age = firey.calculateAge(profile.dateOfBirth)
    if (Array.isArray(suggestions) || suggestions.expiry === 0) {
      mutate({ payload: { age: age } })
    } else {
      // update the preferences if a record already exists
      setValues((prev) => ({
        ...prev,
        foodAllergies: suggestions.allergies ? suggestions.allergies : [],
        ingredientPreferences: suggestions.recommendedIngredients
          ? suggestions.recommendedIngredients
          : [],
        ...(suggestions.preferredCuisine && {
          cusinePreferences: suggestions.preferredCuisine,
        }),
      }))
    }

    hasRun.current = true
  }, [profile?.dateOfBirth, mutate, suggestions])

  return (
    <React.Fragment>
      <Modal
        className="h-full sm:h-3/4 w-full max-w-[720px]"
        open={active}
        handler={handleModalClose}
        primaryBtn={
          <Button type="outline" onClick={handleReset}>
            Reset
          </Button>
        }
        secondaryBtn={
          <Button disabled={isEmpty} onClick={handleConfirm}>
            Save changes
          </Button>
        }
      >
        <div className="px-4 py-4 space-y-5 h-full overflow-x-hidden overflow-y-auto custom-scroll">
          {/* intro */}
          <div>
            <h2 className="text-lg font-semibold">
              Customize Your Diet Preferences
            </h2>
            <p className="text-sm font-medium opacity-85">
              Tailor your diet to fit your lifestyle! Use the options below to
              update your dietary preferences, such as food restrictions,
              preferred cuisines, nutritional goals and many more. Make sure to
              save your changes once you&apos;re done!
            </p>
          </div>

          {/* general purposes */}
          <fieldset>
            {/* general purpose header */}
            <div className="flex items-center">
              <legend className="text-base md:text-lg font-bold">
                {generalPurposeOpt.title}
              </legend>
              <PopoverModal
                containerClass="mt-0 md:mt-1 ml-1"
                content={<Icon name="information" className="size-4" />}
              >
                {generalPurposeOpt.data.map(({ value, info }, idx) => (
                  <div className="w-full text-start p-2" key={`gp-i-${idx}`}>
                    <h5 className="font-semibold  text-sm opacity-97">
                      {value}
                    </h5>
                    <p className="text-xs font-medium opacity-90">{info}</p>
                  </div>
                ))}
              </PopoverModal>
            </div>

            {/* general purpose options */}
            <div className="flex flex-wrap mt-2 gap-2">
              {generalPurposeOpt.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`genPurposesOpts-${idx}`}
                  name={name}
                  value={value}
                  active={values.generalPurpose.includes(value)}
                  onChange={handleGeneralPurposes}
                />
              ))}
            </div>
          </fieldset>

          {/* dietary preferences */}
          <fieldset>
            {/* dietary preferences header */}
            <div className="flex items-center">
              <legend className="text-base md:text-lg font-bold">
                {diertaryPreferenceOpts.title}
              </legend>
              <PopoverModal
                containerClass="mt-0 md:mt-1 ml-1"
                modalClass="size-44"
                content={<Icon name="information" className="size-4" />}
              >
                <div className="w-full text-start p-2">
                  <h5 className="font-semibold  text-sm opacity-97">
                    {diertaryPreferenceOpts.title}
                  </h5>
                  <p className="text-xs font-medium opacity-90">
                    Dietary preferences allow individuals to tailor their diet
                    according to their health needs, ethical beliefs, and
                    personal tastes. By accommodating these preferences, one can
                    enhance nutritional intake, avoid allergens, and support
                    overall well-being. This customization promotes adherence to
                    dietary plans and improves long-term health outcomes.
                  </p>
                </div>
              </PopoverModal>
            </div>

            {/* diertary preferences options */}
            <div className="flex flex-wrap mt-2 gap-2">
              {diertaryPreferenceOpts.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`dietaryPreOpt-${idx}`}
                  name={name}
                  value={value}
                  active={values.diertaryPreferences.includes(value)}
                  onChange={handleDietaryPreferences}
                />
              ))}
            </div>
          </fieldset>

          {/* health goals */}
          <fieldset>
            {/* health goals header */}
            <div className="flex items-center">
              <legend className="text-base md:text-lg font-bold">
                {healthGoalOpts.title}
              </legend>
              <PopoverModal
                containerClass="mt-0 md:mt-1 ml-1"
                content={<Icon name="information" className="size-4" />}
              >
                <div className="w-full text-start p-2">
                  <h5 className="font-semibold  text-sm opacity-97">
                    {healthGoalOpts.title}
                  </h5>
                  <p className="text-xs font-medium opacity-90">
                    Health goals provide a clear direction for individuals to
                    improve their well-being and achieve specific outcomes, such
                    as weight loss, muscle gain, or improved digestion. Setting
                    these goals helps in creating tailored diet and exercise
                    plans, ensuring focused and effective efforts towards better
                    health. This targeted approach can lead to more successful
                    and sustainable lifestyle changes.
                  </p>
                </div>
              </PopoverModal>
            </div>

            {/* health goal options */}
            <div className="flex flex-wrap mt-2 gap-2">
              {healthGoalOpts.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`healthGoalOpt-${idx}`}
                  name={name}
                  value={value}
                  active={values.healthGoals.includes(value)}
                  onChange={handleHealthGoals}
                />
              ))}
            </div>
          </fieldset>

          {/* food allergies */}
          <fieldset>
            <legend className="text-base md:text-lg font-bold">
              {allergyOpts.title}
            </legend>

            {/* food allergy options */}
            <div className="flex flex-wrap mt-2 gap-2">
              {allergyOpts.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`alergyOpt-${idx}`}
                  name={name}
                  value={value}
                  active={values.foodAllergies.includes(value.toLowerCase())}
                  onChange={handleFoodAllergies}
                />
              ))}
            </div>
          </fieldset>

          {/* preferred ingredients */}
          <fieldset>
            <legend className="text-base md:text-lg font-bold">
              {ingredientPreferenceOpts.title}
            </legend>

            {/* preferred ingredient options */}
            <div className="flex flex-wrap mt-2 gap-2">
              {ingredientPreferenceOpts.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`piOpt-${idx}`}
                  name={name}
                  value={value}
                  active={values.ingredientPreferences.includes(
                    value.toLowerCase()
                  )}
                  onChange={handleIngredients}
                />
              ))}
            </div>
          </fieldset>

          {/* cooking preferences */}
          {/* <fieldset> */}
          {/* <legend className="text-base md:text-lg font-bold">
              {cookingPreferenceOpts.title}
            </legend> */}

          {/* cooking preference options */}
          {/* <div className="flex flex-wrap mt-2 gap-2">
              {cookingPreferenceOpts.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`ciOpt-${idx}`}
                  name={name}
                  value={value}
                  active={values.cookingPreferences.includes(value)}
                  onChange={handleCookingPref}
                />
              ))}
            </div> */}
          {/* </fieldset> */}

          {/* cuisine preferences */}
          <fieldset>
            <legend className="text-base md:text-lg font-bold">
              {cusineOpts.title}
            </legend>

            {/* cooking preference options */}
            <div className="flex flex-wrap mt-2 gap-2">
              {cusineOpts.data.map(({ name, value }, idx) => (
                <Checkbox
                  key={`cusineOpts-${idx}`}
                  name={name}
                  value={value}
                  active={values.cusinePreferences === value}
                  onChange={handleCusinePref}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </Modal>

      {/* customize preferences */}
      <div
        className="flex items-center bg-zinc-200 hover:bg-zinc-300 dark:bg-neutral-800/70 dark:hover:bg-neutral-700 transition duration-300 px-2.5 py-2 rounded-md w-fit ml-[2px] mt-2 cursor-pointer"
        onClick={handleOpenModal}
      >
        <div>
          <Icon
            name="edit-icon"
            className="size-[18px] opacity-80 mt-0.5 fill-neutral-500 dark:fill-neutral-400"
          />
        </div>
        <span className="text-sm ml-1 -mt-0.5 font-semibold opacity-80">
          customize preference
        </span>
      </div>
    </React.Fragment>
  )
}
