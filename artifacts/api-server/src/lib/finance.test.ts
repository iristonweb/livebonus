import assert from "node:assert/strict";
import test from "node:test";
import {
  quotePartnerPurchase,
  quoteRentalDeal,
  parseRub,
  reconcileBalances,
} from "./finance.js";

test("purchase quote applies the 15% cap and calculates fee from net", () => {
  const quote = quotePartnerPurchase({
    grossAmountRub: "1000.00",
    availableBonusRub: "1000.00",
  });
  assert.equal(quote.valid, true);
  assert.equal(quote.maxBonusRedemptionRub, 150);
  assert.equal(quote.bonusRedeemedRub, 150);
  assert.equal(quote.netAmountRub, 850);
  assert.equal(quote.partnerFeeRub, 12.75);
});

test("control purchase example keeps partner fee outside the user debit", () => {
  const quote = quotePartnerPurchase({
    grossAmountRub: "10000.00",
    availableBonusRub: "1500.00",
  });
  assert.equal(quote.valid, true);
  assert.equal(quote.grossAmountRub, 10000);
  assert.equal(quote.bonusRedeemedRub, 1500);
  assert.equal(quote.netAmountRub, 8500);
  assert.equal(quote.partnerFeeRub, 127.5);
  assert.equal(quote.netAmountRub + quote.bonusRedeemedRub, quote.grossAmountRub);
});

test("purchase quote never allows a requested amount above cap or balance", () => {
  const aboveCap = quotePartnerPurchase({
    grossAmountRub: 100,
    availableBonusRub: 100,
    requestedBonusRub: 16,
  });
  assert.equal(aboveCap.valid, false);
  assert.ok(aboveCap.errors.some((error) => error.code === "MAX_REDEMPTION_EXCEEDED"));

  const aboveBalance = quotePartnerPurchase({
    grossAmountRub: 1000,
    availableBonusRub: 10,
    requestedBonusRub: 11,
  });
  assert.equal(aboveBalance.valid, false);
  assert.ok(aboveBalance.errors.some((error) => error.code === "INSUFFICIENT_BALANCE"));
});

test("quotes use exact cent arithmetic for fractional amounts", () => {
  const purchase = quotePartnerPurchase({
    grossAmountRub: "0.01",
    availableBonusRub: "10.00",
  });
  assert.equal(purchase.maxBonusRedemptionRub, 0);
  assert.equal(purchase.partnerFeeRub, 0);

  const rental = quoteRentalDeal({ grossAmountRub: "12345.67" });
  assert.equal(rental.landlordFeeRub, 185.19);
  assert.equal(rental.landlordBonusRub, 1234.57);
  assert.equal(rental.tenantBonusRub, 1234.57);
});

test("rental quote creates independent landlord and tenant bonuses", () => {
  const quote = quoteRentalDeal({ grossAmountRub: "100000.00" });
  assert.equal(quote.valid, true);
  assert.equal(quote.landlordFeeRub, 1500);
  assert.equal(quote.landlordBonusRub, 10000);
  assert.equal(quote.tenantBonusRub, 10000);
});

test("money parser rejects negative and over-precise values", () => {
  assert.equal(parseRub("-1.00").ok, false);
  assert.equal(parseRub("1.001").ok, false);
  assert.equal(parseRub("90071992547409.99").ok, true);
  assert.equal(parseRub(Number.MAX_SAFE_INTEGER).ok, false);
});

test("balance reconciliation treats an exact legacy conversion as consistent", () => {
  const result = reconcileBalances({ pointsBalance: 125, bonusBalanceRub: "100.00" });
  assert.equal(result.status, "consistent");
  assert.equal(result.differenceCents, 0n);
  assert.equal(result.legacyEquivalentPoints, 125);
});

test("balance reconciliation allows at most half a point of monetary rounding", () => {
  const rounding = reconcileBalances({ pointsBalance: 125, bonusBalanceRub: "100.40" });
  assert.equal(rounding.status, "rounding_difference");
  assert.equal(rounding.differenceCents, 40n);

  const mismatch = reconcileBalances({ pointsBalance: 125, bonusBalanceRub: "100.41" });
  assert.equal(mismatch.status, "mismatch");
  assert.equal(mismatch.differenceCents, 41n);
});

test("balance reconciliation identifies accounts that still use the legacy source", () => {
  const result = reconcileBalances({ pointsBalance: 125, bonusBalanceRub: null });
  assert.equal(result.status, "unmigrated");
  assert.equal(result.monetaryBalanceCents, null);
  assert.equal(result.differenceCents, null);
});