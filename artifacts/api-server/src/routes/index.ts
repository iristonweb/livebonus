import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import partnersRouter from "./partners.js";
import transactionsRouter from "./transactions.js";
import offersRouter from "./offers.js";
import dashboardRouter from "./dashboard.js";
import storageRouter from "./storage.js";
import bonusRouter from "./bonus.js";
import adminRouter from "./admin.js";
import scoreRouter from "./score.js";
import leasesRouter from "./leases.js";
import authRouter from "./auth.js";
import financeRouter from "./finance.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/partners", partnersRouter);
router.use("/transactions", transactionsRouter);
router.use("/offers", offersRouter);
router.use("/dashboard", dashboardRouter);
router.use(storageRouter);
router.use("/bonus", bonusRouter);
router.use("/admin", adminRouter);
router.use("/score", scoreRouter);
router.use("/leases", leasesRouter);
router.use("/finance", financeRouter);

export default router;
