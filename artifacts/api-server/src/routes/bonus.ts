import { Router } from "express";
import { calculateBonus } from "../lib/bonus";
import { CalculateBonusBody } from "@workspace/api-zod";

const router = Router();

router.post("/calculate", (req, res) => {
  const parsed = CalculateBonusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const result = calculateBonus(parsed.data);
  res.json(result);
});

export default router;
