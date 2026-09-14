import { userService } from "@/lib/services/user"

/** Shared React Query key — all profile reads must use this to dedupe network calls. */
export const USER_PROFILE_QUERY_KEY: [string] = ["users:profile"]

/** Session account for any role (admin, patient, etc.). */
export const USER_ACCOUNT_QUERY_KEY: [string] = ["users:account"]

export function fetchUserProfile(token: string) {
  return userService.profile(token)
}

export function fetchAccount(token: string) {
  return userService.account(token)
}
