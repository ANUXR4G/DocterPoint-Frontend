import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors, space } from "@/lib/theme";
import type { RazorpaySubCheckout } from "@/lib/procto";

export type RazorpaySubPaymentResult = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type Props = {
  visible: boolean;
  checkout: RazorpaySubCheckout | null;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (result: RazorpaySubPaymentResult) => void;
  onClose: (reason?: string) => void;
};

function buildCheckoutHtml(
  checkout: RazorpaySubCheckout,
  prefill?: Props["prefill"],
): string {
  const options = {
    key: checkout.keyId,
    subscription_id: checkout.subscriptionId,
    name: "GlucoGuide",
    description: `${checkout.planName} · ₹${checkout.amountInr.toLocaleString("en-IN")}/mo`,
    theme: { color: "#0f5c5c" },
    prefill: prefill ?? {},
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: #f0f4f3; font-family: -apple-system, system-ui, sans-serif; }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { text-align: center; color: #3d5566; font-size: 14px; }
  </style>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
  <div class="wrap"><div class="card" id="status">Opening Razorpay…</div></div>
  <script>
    (function () {
      var options = ${JSON.stringify(options)};
      options.handler = function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "success",
          payload: response
        }));
      };
      options.modal = {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
        }
      };
      try {
        var rzp = new Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          var desc = (resp && resp.error && resp.error.description) || "Payment failed";
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "error",
            message: desc
          }));
        });
        rzp.open();
        document.getElementById("status").textContent = "Complete payment in the Razorpay sheet.";
      } catch (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "error",
          message: (err && err.message) || "Could not open Razorpay"
        }));
      }
    })();
  </script>
</body>
</html>`;
}

export function RazorpayCheckoutModal({
  visible,
  checkout,
  prefill,
  onSuccess,
  onClose,
}: Props) {
  function onMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        payload?: RazorpaySubPaymentResult;
        message?: string;
      };
      if (data.type === "success" && data.payload) {
        onSuccess(data.payload);
        return;
      }
      if (data.type === "dismiss") {
        onClose("Checkout closed before payment completed.");
        return;
      }
      if (data.type === "error") {
        onClose(data.message || "Payment failed.");
      }
    } catch {
      onClose("Unexpected checkout response.");
    }
  }

  if (!checkout) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => onClose()}
    >
      <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Razorpay</Text>
          <Pressable onPress={() => onClose()} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <WebView
          originWhitelist={["*"]}
          source={{ html: buildCheckoutHtml(checkout, prefill) }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          style={styles.webview}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  close: { fontSize: 15, fontWeight: "700", color: colors.brand },
  webview: { flex: 1, backgroundColor: colors.paper },
});
