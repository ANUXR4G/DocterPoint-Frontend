import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DocumentScanPreview } from "@/components/DocumentScanPreview";
import { Field } from "@/components/ui";
import {
  formatAadhaarDisplay,
  panValidationMessage,
  parseAadhaarInput,
  parsePanInput,
} from "@/lib/indianIdInput";
import { prepareIdScanImage } from "@/lib/prepareIdScanImage";
import { colors, space } from "@/lib/theme";
import {
  scanIdDocumentGuest,
  type IdScanResult,
} from "@/lib/user";

const MAX_IMAGES = 5;

type UploadedImage = {
  id: string;
  fileName: string;
  uri: string;
  base64: string;
  mimeType: string;
  documentType?: string | null;
  scanError?: string;
};

export type IdentityDocumentsPayload = {
  idImages: Array<{
    base64: string;
    mimeType: string;
    documentType?: string | null;
  }>;
  profilePhoto: { base64: string; mimeType: string } | null;
};

export type ProfileDraft = {
  name: string;
  gender: "male" | "female" | "others";
  address: string;
  profession: string;
  dateOfBirth: string;
  contactNumber: string;
  emergencyNumber: string;
};

type Props = {
  onProfileChange: (
    next: ProfileDraft | ((prev: ProfileDraft) => ProfileDraft),
  ) => void;
  aadharNumber: string;
  panNumber: string;
  onAadharNumberChange: (value: string) => void;
  onPanNumberChange: (value: string) => void;
  onDocumentsChange: (payload: IdentityDocumentsPayload) => void;
};

function applyScanToForm(
  data: IdScanResult,
  onProfileChange: (updater: (prev: ProfileDraft) => ProfileDraft) => void,
  onAadharNumberChange: (value: string) => void,
  onPanNumberChange: (value: string) => void,
) {
  onProfileChange((prev) => {
    const next = { ...prev };
    if (data.name) next.name = data.name;
    if (data.gender) next.gender = data.gender;
    if (data.address) next.address = data.address;
    if (data.contactNumber) next.contactNumber = data.contactNumber;
    if (data.dateOfBirth) next.dateOfBirth = data.dateOfBirth;
    return next;
  });
  if (data.aadharNumber) onAadharNumberChange(data.aadharNumber);
  if (data.panNumber) onPanNumberChange(data.panNumber);
}

function pickProfilePhotoId(items: UploadedImage[]): string | null {
  if (items.length === 0) return null;
  return (
    items.find((item) => item.documentType === "AADHAAR")?.id ?? items[0]!.id
  );
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function IdDocumentScanSection({
  onProfileChange,
  aadharNumber,
  panNumber,
  onAadharNumberChange,
  onPanNumberChange,
  onDocumentsChange,
}: Props) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [profilePhotoId, setProfilePhotoId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [scanningPreview, setScanningPreview] = useState<{
    uri: string;
    fileName: string;
  } | null>(null);

  useEffect(() => {
    const idImages = images.map(({ base64, mimeType, documentType }) => ({
      base64,
      mimeType,
      documentType,
    }));

    let profilePhoto: { base64: string; mimeType: string } | null = null;
    if (profilePhotoId) {
      const selected = images.find((img) => img.id === profilePhotoId);
      if (selected) {
        profilePhoto = { base64: selected.base64, mimeType: selected.mimeType };
      }
    }

    onDocumentsChange({ idImages, profilePhoto });
  }, [images, profilePhotoId, onDocumentsChange]);

  async function pickAndScan() {
    if (images.length >= MAX_IMAGES) {
      setError(`You can upload up to ${MAX_IMAGES} ID images.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo access was blocked. Allow photos in settings.");
      return;
    }

    const remaining = MAX_IMAGES - images.length;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });

    if (picked.canceled || picked.assets.length === 0) return;

    setError(null);
    setMessage(null);
    setIsLoading(true);

    const added: UploadedImage[] = [];
    let scannedCount = 0;

    try {
      for (const asset of picked.assets.slice(0, remaining)) {
        const fileName = asset.fileName ?? "ID photo";
        setLoadingLabel(`Reading ${fileName}…`);
        setScanningPreview({ uri: asset.uri, fileName });

        const { base64, mimeType } = await prepareIdScanImage(asset.uri);
        const item: UploadedImage = {
          id: newId(),
          fileName,
          uri: asset.uri,
          base64,
          mimeType,
        };

        try {
          const res = await scanIdDocumentGuest({ imageBase64: base64, mimeType });
          if (res.status !== "successful" || !res.data) {
            throw new Error(res.message || "No details returned from scan.");
          }
          item.documentType = res.data.documentType;
          applyScanToForm(
            res.data,
            onProfileChange,
            onAadharNumberChange,
            onPanNumberChange,
          );
          scannedCount += 1;
        } catch (scanErr) {
          item.scanError =
            scanErr instanceof Error
              ? scanErr.message
              : "Could not read this image.";
        }

        added.push(item);
      }

      if (added.length === 0) return;

      setImages((prev) => {
        const next = [...prev, ...added].slice(0, MAX_IMAGES);
        setProfilePhotoId((current) => {
          const aadhaar = next.find((img) => img.documentType === "AADHAAR");
          if (aadhaar) return aadhaar.id;
          if (current && next.some((img) => img.id === current)) return current;
          return pickProfilePhotoId(next);
        });
        return next;
      });

      if (scannedCount > 0) {
        setMessage(
          scannedCount === 1
            ? "ID read — review your details and ID numbers below."
            : `Read ${scannedCount} documents — review your details below.`,
        );
      } else {
        setMessage(
          "Images saved. Enter details manually if the scan did not fill them.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read the documents.",
      );
    } finally {
      setIsLoading(false);
      setLoadingLabel(null);
      setScanningPreview(null);
    }
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id);
      setProfilePhotoId((current) =>
        current === id ? pickProfilePhotoId(next) : current,
      );
      return next;
    });
  }

  const panError = panValidationMessage(panNumber);

  return (
    <View style={styles.wrap}>
      <View style={styles.uploadCard}>
        <Text style={styles.uploadTitle}>Upload ID documents (optional)</Text>
        <Text style={styles.uploadHint}>
          Add up to {MAX_IMAGES} photos. We read each image, fill your details,
          and use your Aadhaar photo (or first upload) as your profile picture.
        </Text>

        <Pressable
          onPress={() => void pickAndScan()}
          disabled={isLoading || images.length >= MAX_IMAGES}
          style={({ pressed }) => [
            styles.uploadButton,
            (isLoading || images.length >= MAX_IMAGES) && styles.uploadDisabled,
            pressed && !isLoading && styles.uploadPressed,
          ]}
        >
          <Text style={styles.uploadButtonText}>
            {isLoading
              ? loadingLabel || "Reading document…"
              : images.length >= MAX_IMAGES
                ? "Maximum images added"
                : "Add ID images"}
          </Text>
        </Pressable>

        {scanningPreview ? (
          <View style={styles.previewWrap}>
            <DocumentScanPreview
              source={{ uri: scanningPreview.uri }}
              fileName={scanningPreview.fileName}
              scanning
            />
          </View>
        ) : null}

        {images.length > 0 ? (
          <View style={styles.grid}>
            {images.map((img) => (
              <View key={img.id} style={styles.thumbCard}>
                <Image source={{ uri: img.uri }} style={styles.thumb} />
                <Text style={styles.thumbMeta} numberOfLines={2}>
                  {img.fileName}
                  {img.documentType ? ` · ${img.documentType}` : ""}
                  {profilePhotoId === img.id ? " · Profile photo" : ""}
                </Text>
                {img.scanError ? (
                  <Text style={styles.thumbError}>{img.scanError}</Text>
                ) : null}
                <Pressable
                  onPress={() => removeImage(img.id)}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.fail}>{error}</Text> : null}
      </View>

      <Field
        label="Aadhaar number (optional)"
        value={formatAadhaarDisplay(aadharNumber)}
        onChangeText={(text) => onAadharNumberChange(parseAadhaarInput(text))}
        keyboardType="number-pad"
        placeholder="1234 5678 9012"
      />
      {aadharNumber.length > 0 && aadharNumber.length !== 12 ? (
        <Text style={styles.fieldError}>Aadhaar must be exactly 12 digits.</Text>
      ) : null}

      <Field
        label="PAN (optional)"
        value={panNumber}
        onChangeText={(text) => onPanNumberChange(parsePanInput(text))}
        autoCapitalize="characters"
        placeholder="ABCDE1234F"
        maxLength={10}
      />
      {panError ? <Text style={styles.fieldError}>{panError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  uploadCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 16,
    padding: space.md,
    backgroundColor: colors.paperRaised,
  },
  uploadTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  uploadHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  uploadButton: {
    marginTop: space.md,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  uploadDisabled: { opacity: 0.55 },
  uploadPressed: { opacity: 0.9 },
  uploadButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  previewWrap: { marginTop: space.md, maxWidth: 320 },
  grid: { marginTop: space.md, gap: space.sm },
  thumbCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: space.sm,
    position: "relative",
  },
  thumb: {
    width: "100%",
    height: 120,
    borderRadius: 8,
  },
  thumbMeta: {
    marginTop: 6,
    fontSize: 11,
    color: colors.inkSoft,
  },
  thumbError: {
    marginTop: 4,
    fontSize: 11,
    color: "#b45309",
  },
  removeBtn: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeBtnText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  success: {
    marginTop: space.sm,
    fontSize: 12,
    fontWeight: "600",
    color: "#047857",
  },
  fail: {
    marginTop: space.sm,
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  fieldError: {
    marginTop: -8,
    marginBottom: space.sm,
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
});
