import { InfoForm } from "@/components"

export default function InfoPage() {
  return (
    <div>
      <div className="center flex-col mt-8 2xl:mt-12">
        <p className="text-sm 2xl:text-base max-w-sm text-center">
          To make meaningful connections with this web app, complete your
          profile.
        </p>

        {/* info form */}
        <InfoForm />
      </div>
    </div>
  )
}
