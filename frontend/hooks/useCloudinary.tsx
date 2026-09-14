import { firey } from "@/utils"
import { useState } from "react"

export function useCloudinary(
  imgFile: File | null,
  onSuccess?: (imgSrc: string) => Promise<any> | void
) {
  const [isUploading, setIsUploading] = useState<boolean>(false)
  async function handleImgUpload(overrideFile?: File | null) {
    const file = overrideFile ?? imgFile
    if (!file) return
    setIsUploading(true)

    try {
      const newFileName = `${firey.camelize(file.name)}-${firey.getID()}`
      const formData = new FormData()

      formData.append("file", file)
      formData.append("upload_preset", "gluco-guide-users")
      formData.append("public_id", newFileName)

      const data = await fetch(
        `https://api.cloudinary.com/v1_1/dwhlynqj3/image/upload`,
        {
          method: "POST",
          body: formData,
        },
      )

      if (!data.ok) {
        throw new Error(`failed to upload image to cloudinary.`)
      }

      const json = await data.json()
      if (onSuccess && json?.secure_url) {
        await onSuccess(json.secure_url as string)
      }
      return json
    } finally {
      setIsUploading(false)
    }
  }

  return { handleImgUpload, isUploading }
}
