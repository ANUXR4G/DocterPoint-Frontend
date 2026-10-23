import { redirect } from "next/navigation"

export default function DoctorMedicinesPage() {
  redirect("/doctor/master?tab=medicines")
}
