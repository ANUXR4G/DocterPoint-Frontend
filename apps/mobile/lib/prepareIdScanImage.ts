import * as ImageManipulator from "expo-image-manipulator";

/** Resize ID photos before OCR so uploads stay fast and reliable. */
export async function prepareIdScanImage(
  uri: string,
): Promise<{ base64: string; mimeType: string }> {
  const mimeType = "image/jpeg";
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!result.base64) {
    throw new Error("Could not read image.");
  }

  return { base64: result.base64, mimeType };
}
