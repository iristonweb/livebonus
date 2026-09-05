import { writeFile } from "node:fs/promises";

const requiredScenarios = [
  "authSession",
  "passportPrivacy",
  "scoreDispute",
  "hostedCheckoutReturn",
];
const paymentStatuses = ["succeeded", "canceled", "failed"];
const platform = process.env.NATIVE_PLATFORM;
const mode = process.env.NATIVE_RELEASE_FIXTURE_MODE;

function validResult() {
  return {
    status: "passed",
    device: {
      model: process.env.NATIVE_TARGET_MODEL,
      os: process.env.NATIVE_TARGET_OS,
      expoGoVersion: process.env.NATIVE_EXPO_GO_VERSION,
      buildVersion: process.env.NATIVE_BUILD_VERSION,
    },
    scenarios: Object.fromEntries(requiredScenarios.map(scenario => [scenario, "passed"])),
    paymentPolling: {
      statuses: Object.fromEntries(paymentStatuses.map(paymentStatus => [
        paymentStatus,
        {
          status: "passed",
          paymentId: `${platform}-${paymentStatus}-fixture`,
          backgroundDurationMs: 8200,
          backgroundIntervalsMs: [8200],
          statusRequestCounts: {
            foregroundBeforeBackground: 2,
            duringBackground: 0,
            foregroundAfterBackground: 1,
            terminal: 1,
          },
        },
      ])),
    },
  };
}

if (mode === "blocked") {
  await writeFile(
    process.env.NATIVE_REPORT_PATH,
    JSON.stringify({
      status: "blocked",
      reason: "Fixture device lab blocked this target",
    }),
  );
} else {
  const result = validResult();
  if (mode === "missing-device") {
    result.device.model = "";
  } else if (mode === "incomplete-scenarios") {
    delete result.scenarios.passportPrivacy;
  } else if (mode === "bad-payment-counters") {
    result.paymentPolling.statuses.succeeded.statusRequestCounts.duringBackground = 1;
  }
  await writeFile(process.env.NATIVE_REPORT_PATH, JSON.stringify(result));
  if (mode === "adapter-fail") process.exitCode = 7;
}