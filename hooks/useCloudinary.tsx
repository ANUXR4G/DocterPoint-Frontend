import { firey } from "@/utils"
import { useState } from "react"

export function useCloudinary(
  imgFile: File | null,
  onSuccess?: (imgSrc: string) => Promise<any> | void
) {
  const [isUploading, setIsUploading] = useState<boolean>(false)
  async function handleImgUpload() {
    if (!imgFile) return
    setIsUploading(true)

    const newFileName = `${firey.camelize(imgFile.name)}-${firey.getID()}`
    const formData = new FormData()

    formData.append("file", imgFile)
    formData.append("upload_preset", "gluco-guide-users")
    formData.append("public_id", newFileName)

    const data = await fetch(
      `https://api.cloudinary.com/v1_1/dwhlynqj3/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    )

    if (!data.ok) {
      throw new Error(`failed to upload image to cloudinary.`)
    }

    setIsUploading(false)
    return await data.json()
  }

  return { handleImgUpload, isUploading }
}
