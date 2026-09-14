import { Redirect } from "expo-router";

/** Calendar lives on My visits (List | Calendar switch). */
export default function CareScreenRedirect() {
  return <Redirect href="/(app)/appointments" />;
}
