import { Icon, Form, CoolKid } from "@/components"
import { GoogleButton } from "@/components/buttons/GoogleButton"

export default async function LoginPage() {
  const currentYear = new Date().getFullYear()

  return (
    <div className="full center flex-col px-4 max-w-2xl mx-auto lg:flex-row lg:max-w-screen-3xl lg:px-8">
      <div className="max-w-2xl">
        {/* logo */}
        <div className="flex flex-col items-center">
          <div className="hidden md:flex flex-col items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Icon className="size-10" name="gluco-guide" />
              <h3 className="font-extrabold text-[#0067FF] text-3xl">
                GlucoGuide
              </h3>
            </div>
            {/* description */}
            <p className="mt-2 mb-4 text-sm text-center px-2 opacity-80">
              Glucoguide helps you find nearby hospitals, book doctor
              appointments, track health records, and receive personalized diet
              and exercise recommendations.
            </p>
          </div>
          {/* form inner */}
          <Form />
        </div>

        <div className="mt-6 relative text-center">
          <div className="before:contents[''] before:absolute before:w-full before:h-0.5 before:left-0 before:top-1/2 -before:translate-y-1/2 before:bg-neutral-700 before:rounded-sm">
            <span className="font-medium relative px-2.5 z-10 dark:bg-zinc-900 dark:text-[#a3a3a3] continue-gray">
              or continue with
            </span>
          </div>
        </div>

        {/* google provider */}
        <GoogleButton />
        <div className="mt-4">
          <p className="text-center text-sm">
            &#169; {currentYear} GlucoGuide. Your Trusted Partner in Diabetes
            Management. For support, contact us at support@gguide.com. Keep
            moving forward, one healthy step at a time.
          </p>
        </div>
      </div>
      {/* asset */}
      <div className="hidden lg:flex w-3/4">
        <CoolKid className="mb-40" />
      </div>
    </div>
  )
}
