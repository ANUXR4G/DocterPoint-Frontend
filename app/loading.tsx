import dynamic from "next/dynamic"

const CoolKid = dynamic(() => import("../components/fancy/CoolKid"), {
  ssr: false,
})

export default function Loading() {
  return (
    <div
      role="status"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse"
    >
      <div className="">
        <CoolKid className="min-w-[286px] xxs:min-w-[364px] max-w-2xl ml-4 -mt-16 lg:ml-16" />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  )
}
