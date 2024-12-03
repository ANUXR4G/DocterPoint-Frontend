import React, { ChangeEvent, useCallback, useEffect, useState } from "react"

type FormErrors<T> = Partial<Record<keyof T, string>>
type Touched<T> = Partial<Record<keyof T, boolean>>
type Validator<T> = (values: T) => FormErrors<T>

type UseFormType<T> = {
  initialValues: T
  onSubmit: (values: T) => Promise<any> | void
  validator?: Validator<T>
}

export function useForm<T>({
  initialValues,
  onSubmit,
  validator,
}: UseFormType<T>) {
  const [values, setValues] = useState<T>(initialValues)
  const [touched, setTouched] = useState<Touched<T>>({})
  const [errors, setErrors] = useState<FormErrors<T>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false)

  // set to true if the input was touched
  const handleBlur = useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      const { name } = e.target
      setTouched((prev) => ({ ...prev, [name]: true }))
    },
    []
  )

  // handle on change event for the inputs
  const handleChange = useCallback(
    (
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
      const { type, name, value } = e.target
      if (type === "checkbox") {
        const { checked } = e.target as HTMLInputElement
        setValues((prev) => ({ ...prev, [name]: checked }))
      } else {
        setValues((prev) => ({
          ...prev,
          [name]: value,
        }))
      }
    },
    []
  )

  // handle form submission
  const handleSubmit = useCallback(async () => {
    if (validator) {
      const validatorErrors = validator(values)
      setErrors(validatorErrors)

      const errorKeys = Object.keys(validatorErrors)
      if (errorKeys.length > 0) {
        // update input touched state if there is any error
        errorKeys.map((key) => setTouched((prev) => ({ ...prev, [key]: true })))
        setIsDisabled(true) // disable the submission button
        return // skip everything n return
      }
    }

    setIsSubmitting(true)

    // handle the submission
    await onSubmit(values)

    setIsSubmitting(false)
  }, [values, validator, onSubmit])

  // make sure to always set the errors
  // also make sure that disable button state gets updated
  useEffect(() => {
    if (validator) {
      const validatorErrors = validator(values)
      setErrors(validatorErrors)
      if (isDisabled && Object.keys(validatorErrors).length === 0) {
        setIsDisabled(false)
      }
    }
  }, [validator, values, isDisabled])

  return {
    values,
    setValues,
    touched,
    errors,
    isSubmitting,
    isDisabled,
    handleChange,
    handleBlur,
    handleSubmit,
  }
}

// usage guide
// const { values, touched, handleChange, handleBlur, handleSubmit, isSubmitting, errors } = useForm({
//   initialValues: { email: "" },
//   onSubmit: (result) => { console.log(result) },
//   validator: validations.login,
// });

// optimize input renders
// wrap the input component with React.memo() for inexpensive performace
// ps, React.useCallback functions is for optimizing so using a React.useCallback w/o memo function is useless
// const Input = React.memo(({ name, type, value, onChange, onBlur }: Props) => {
//   return <input name={name} type={type} value={value} onChange={onChange} onBlur={onBlur} />;
// });

// the error can be accessed by the following line
// const emailError = touched.email ? errors.email : undefined
