import { Suspense } from "react"
import BookingConfirmationContent from "./BookingConfirmationContent"

export default function BookingConfirmationPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm opacity-70">Loading…</p>}>
      <BookingConfirmationContent />
    </Suspense>
  )
}
