"use client"

import { useLottie } from "@/hooks/useLottie"
import sceneJSON from "@/lib/dummy/cool-kid.json"

type Props = {
  className?: string
}

export default function CoolKid({ className }: Props) {
  const { ref: scene } = useLottie(sceneJSON)
  return <div className={className} ref={scene} />
}
