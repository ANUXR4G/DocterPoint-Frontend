import { redirect } from "next/navigation"

export default function ClinicMedicinesPage() {
  redirect("/clinic/master?tab=medicines")
}
