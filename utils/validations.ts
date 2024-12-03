import { AuthValues, FormErrors } from "@/types"

function auth(values: AuthValues) {
  const errors: FormErrors<AuthValues> = {}

  if (!values.email) {
    errors.email = "Email is required"
  } else if (!/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(values.email)) {
    errors.email = "Email address is invalid"
  }
  if (!values.password) {
    errors.password = "Password is required"
  } else if (values.password.length < 6) {
    errors.password = "Password is too short"
  }

  return errors
}

export const validations = {
  auth,
}
