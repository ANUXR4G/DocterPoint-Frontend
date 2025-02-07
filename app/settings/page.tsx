import { ThemeUI } from "@/components"

export default function SettingsPage() {
  return (
    <div className="px-4 lg:px-8">
      <div className="mt-2 lg:mt-4 center flex-col md:items-start">
        <h1 className="text-xl font-semibold leading-6">Appearance</h1>
        <p className="text-sm">Select or customize your UI theme.</p>
      </div>
      <ThemeUI />
    </div>
  )
}
