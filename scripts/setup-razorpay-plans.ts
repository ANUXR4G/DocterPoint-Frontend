/**
 * One-time setup: create Razorpay Plans for each clinic plan missing razorpayPlanId.
 *
 * Usage (with test keys in backend/.env or root .env):
 *   npm run razorpay:plans
 */
import { prisma } from "../src/db/prisma.js";
import { razorpay } from "../src/lib/razorpay.js";

async function main() {
  if (!razorpay.isConfigured()) {
    console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env first.");
    process.exit(1);
  }

  const plans = await prisma.docLinePlan.findMany({
    where: { isActive: true, priceMonthlyInr: { gt: 0 } },
  });

  for (const plan of plans) {
    if (plan.razorpayPlanId) {
      console.log(`✓ ${plan.name} already has ${plan.razorpayPlanId}`);
      continue;
    }

    const remote = await razorpay.createPlan({
      period: "monthly",
      interval: 1,
      item: {
        name: `GlucoGuide ${plan.name}`,
        amount: plan.priceMonthlyInr * 100,
        currency: "INR",
        description: `GlucoGuide ${plan.name} monthly`,
      },
    });

    await prisma.docLinePlan.update({
      where: { id: plan.id },
      data: { razorpayPlanId: remote.id },
    });
    console.log(`✓ Created Razorpay plan for ${plan.name}: ${remote.id}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
