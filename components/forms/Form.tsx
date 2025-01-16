"use client"

import Link from "next/link"
import React, { useEffect } from "react"
import { motion } from "framer-motion"
import { useMutation } from "react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { firey } from "@/utils"
import { userService } from "@/lib/services/user"
import { validations } from "@/utils/validations"
import { AuthValues, AuthValueType } from "@/types"
import { useForm } from "@/hooks/useForm"
import { IconInput, Button, Icon } from "@/components"

const initialValues: AuthValues = {
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
    values,
    errors,
    touched,
    isSubmitting,
    isDisabled,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useForm({
    initialValues,
    onSubmit: (result) => handleAuthentication(result),
    validator: validations.auth,
  })

  const {
    data: loginData,
    isLoading: loginIsLoading,
    isSuccess: loginSuccess,
    error: loginError,
    mutate: loginMutate,
  } = useMutation({
    mutationFn: (credentials: AuthValueType) => userService.login(credentials),
  })

  const {
    data: signupData,
    isLoading: signupIsLoading,
    isSuccess: signupSuccess,
    error: signupError,
    mutate: signupMutate,
  } = useMutation({
    mutationFn: (credentials: AuthValueType) => userService.signup(credentials),
  })

  // push to dashboard after an successful authetication
  useEffect(() => {
    // based on role redirect to specific dashboard
    if ((loginData && loginSuccess) || (signupData && signupSuccess)) {
      if (callbackURL) {
        // redirect to callback url if there is any
        router.push(`${process.env.NEXT_PUBLIC_URL}/${callbackURL}`)
        return
      }
      router.push(
        `/${
          (loginData && loginData.role === "user" && "patient") ||
          (signupData && signupData.role === "user" && "patient") ||
          (loginData && loginData.role) ||
          (signupData && signupData.role)
        }/dashboard`
      )
    }
  }, [loginData, signupData, router, callbackURL, signupSuccess, loginSuccess])

  // handle authentication
  async function handleAuthentication(values: AuthValueType) {
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
  }

  return (
    <div className="text-center max-w-80">
      <h1 className="text-2xl font-bold bg-gradient-to-r dark:from-neutral-500 dark:to-slate-600 bg-clip-text from-slate-900 to-slate-700 dark:bg-clip-text text-transparent">
        {pathname === "login" ? "Sign in" : "Sign up"} with Email
      </h1>
      <p className="text-sm text-gray-500">
        Enter the email address and password associated with your account to{" "}
        {pathname === "login" ? "sign in" : "sign up"}.
      </p>
      <div className="mt-4 flex justify-between text-md bg-gray-100  dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 rounded-md">
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
              <div className="size-full rounded-md bg-neutral-200 dark:bg-neutral-600 absolute top-0 left-0" />
            )}
          </div>
        ))}
      </div>

      {/* email and password input */}
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <IconInput
          icon="envelope"
          name="email"
          label="Email Address"
          value={values.email}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.email ? errors.email : undefined}
        />
        <IconInput
          icon="key"
          name="password"
          type="password"
          label="Password"
          value={values.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.password ? errors.password : undefined}
        />
        {((loginData && loginData.status === "unsuccessful") ||
          (signupData && signupData.status === "unsuccessful") ||
          googleStatus) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-neutral-200/50 dark:bg-neutral-800 py-2.5 rounded-md"
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
          className="w-full center py-5"
          typeBtn="submit"
          disabled={
            isSubmitting || isDisabled || loginIsLoading || signupIsLoading
          }
        >
          {isSubmitting || loginIsLoading || signupIsLoading ? (
            <div className="size-5">
              <Icon name="spinning-loader" className="fill-orange-100" />
            </div>
          ) : (
            `Continue`
          )}
        </Button>
      </form>
    </div>
  )
}
