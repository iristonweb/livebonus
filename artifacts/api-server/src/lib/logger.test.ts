import assert from "node:assert/strict";
import { test } from "node:test";
import { getSecurityEventCounts, recordSecurityEvent } from "./logger.js";

test("security event counters expose repeated events without request data", () => {
  const event = `test_security_event_${Date.now()}`;
  const before = getSecurityEventCounts()[event] ?? 0;

  assert.deepEqual(
    recordSecurityEvent(event, { sourceIp: "203.0.113.10" }),
    { event, occurrenceCount: before + 1 },
  );
  assert.deepEqual(
    recordSecurityEvent(event, { sourceIp: "203.0.113.10" }),
    { event, occurrenceCount: before + 2 },
  );
  assert.equal(getSecurityEventCounts()[event], before + 2);
});