export type RazorpayCheckoutPayload = {
  keyId: string
  subscriptionId: string
  planName: string
  amountInr: number
}

export type RazorpayPaymentResponse = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

type RazorpayInstance = { open: () => void }

type RazorpayConstructor = new (
  options: Record<string, unknown>,
) => RazorpayInstance

function getRazorpayCtor(): RazorpayConstructor | undefined {
  return (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay
}

export function loadRazorpayScript(): Promise<RazorpayConstructor> {
  return new Promise((resolve, reject) => {
    const existing = getRazorpayCtor()
    if (existing) {
      resolve(existing)
      return
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.onload = () => {
      const ctor = getRazorpayCtor()
      if (ctor) resolve(ctor)
      else reject(new Error("Razorpay failed to load"))
    }
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"))
    document.body.appendChild(script)
  })
}

export async function openRazorpaySubscriptionCheckout(
  checkout: RazorpayCheckoutPayload,
  options?: {
    prefill?: { name?: string; email?: string; contact?: string }
    onSuccess?: (response: RazorpayPaymentResponse) => void | Promise<void>
  },
): Promise<RazorpayPaymentResponse> {
  const Razorpay = await loadRazorpayScript()

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: checkout.keyId,
      subscription_id: checkout.subscriptionId,
      name: "GlucoGuide",
      description: `${checkout.planName} · ₹${checkout.amountInr.toLocaleString("en-IN")}/mo`,
      theme: {
        color:
          getComputedStyle(document.documentElement)
            .getPropertyValue("--theme-primary")
            .trim() || "#b794f6",
      },
      prefill: options?.prefill,
      handler: async (response: RazorpayPaymentResponse) => {
        try {
          await options?.onSuccess?.(response)
          resolve(response)
        } catch (err) {
          reject(err)
        }
      },
      modal: {
        ondismiss: () =>
          reject(new Error("Checkout closed before payment completed.")),
      },
    })
    rzp.open()
  })
}
