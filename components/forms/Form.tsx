"use client"

import Link from "next/link"
import React, { useEffect } from "react"
import { motion } from "framer-motion"
import { useMutation } from "react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { firey } from "@/utils"
import { userService } from "@/lib/services/user"
import { validations } from "@/utils/validations"
import { AuthValueType } from "@/types"
import { useForm } from "@/hooks/useForm"
import { IconInput, Button, Icon } from "@/components"

const initialState: AuthValueType = {
  email: "",
  password: "",
}

export default function Form() {
  const pathname = usePathname().replace("/", "")
  const searchParams = useSearchParams()
  const router = useRouter()

  const callbackURL = searchParams.get("callback")
  const googleStatus = searchParams.get("status")

  const {
    errors,
    isSubmitting,
    setIsSubmitting,
    values,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useForm({
    formValues: initialState,
    onSubmit: (val) => handleAuthentication(val),
    validationFunc: validations.auth_validations,
  })

  const {
    data: loginData,
    isLoading: loginIsLoading,
    error: loginError,
    mutate: loginMutate,
  } = useMutation({
    mutationFn: (credentials: AuthValueType) => userService.login(credentials),
  })

  const {
    data: signupData,
    isLoading: signupIsLoading,
    error: signupError,
    mutate: signupMutate,
  } = useMutation({
    mutationFn: (credentials: AuthValueType) => userService.signup(credentials),
  })

  // push to dashboard after an successful authetication
  useEffect(() => {
    // based on role redirect to specific dashboard
    if (
      (loginData && loginData.status === "successful") ||
      (signupData && signupData.status === "successful")
    ) {
      if (callbackURL) {
        // redirect to callback url if there is any n then return
        router.push(`${process.env.NEXT_PUBLIC_URL}/${callbackURL}`)
      }
      router.push(
        `/${
          (loginData && loginData.data.role === "user" && "patient") ||
          (signupData && signupData.data.role === "user" && "patient") ||
          (loginData && loginData.data.role) ||
          (signupData && signupData.data.role)
        }/dashboard`
      )
    }
  }, [loginData, signupData, router, callbackURL])

  const errorExists = Object.keys(errors).some(
    (key) => errors.hasOwnProperty(key) && errors[key] !== null
  )

  // handle authentication
  async function handleAuthentication(values: AuthValueType) {
    if (errorExists) return // return nothing if there is any errors
    const encryptedPass = await firey.generateEncryption(values.password) // encrypted password
    // handle login request
    if (pathname === "login") {
      loginMutate({
        email: values.email,
        password: encryptedPass,
      })
    }

    // handle signup request
    if (pathname === "signup") {
      signupMutate({
        email: values.email,
        password: encryptedPass,
      })
    }

    setIsSubmitting(false)
  }

  return (
    <div className="text-center max-w-80">
      <h1 className="text-2xl font-semibold">
        {pathname === "login" ? "Sign in" : "Sign up"} with email
      </h1>
      <p className="text-sm">
        Enter the email address and password associated with your account to{" "}
        {pathname === "login" ? "sign in" : "sign up"}.
      </p>
      <div className="mt-4 flex justify-between text-md bg-neutral-800 rounded-md">
        {["login", "signup"].map((ctx, idx) => (
          <div
            key={`auth-endpoint-${idx}`}
            className="relative px-4 py-2 w-full m-2"
          >
            <Link
              href={pathname === "login" ? "/signup" : "/login"}
              className={`relative z-10 font-medium transition ${
                pathname === ctx ? `opacity-100` : `opacity-70`
              }`}
            >
              {ctx}
            </Link>
            {pathname === ctx && (
              <div className="size-full rounded-md bg-neutral-600 absolute top-0 left-0" />
            )}
          </div>
        ))}
      </div>

      {/* email and password input */}
      <div className="mt-5 flex flex-col gap-4">
        <IconInput
          value={values.email}
          onChange={handleChange}
          status={errors["email"]}
          onBlur={handleBlur}
          name="email"
        />
        <IconInput
          value={values.password}
          onChange={handleChange}
          status={errors["password"]}
          onBlur={handleBlur}
          icon="key"
          name="password"
          type="password"
          label="Password"
        />
        {((loginData && loginData.status === "unsuccessful") ||
          (signupData && signupData.status === "unsuccessful") ||
          googleStatus) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-neutral-800 py-2.5 rounded-md"
          >
            <p className="text-sm text-red-500 opacity-80">
              {(loginData && loginData.message) ||
                (signupData && signupData.message) ||
                (googleStatus &&
                  googleStatus === "nuser" &&
                  "no account associated with this email!") ||
                (googleStatus &&
                  googleStatus === "unknown" &&
                  "something went wrong, try again!")}
            </p>
          </motion.div>
        )}

        <Button
          disabled={errorExists}
          className="w-full center py-5"
          onClick={handleSubmit}
        >
          {(!errorExists && isSubmitting) ||
          loginIsLoading ||
          signupIsLoading ? (
            <div className="size-5">
              <Icon name="spinning-loader" className="fill-orange-100" />
            </div>
          ) : (
            `Continue`
          )}
        </Button>
      </div>
    </div>
  )
}
