import { Router, type IRouter } from "express";
import healthRouter from "./health";
import walletsRouter from "./wallets";
import searchesRouter from "./searches";
import submissionsRouter from "./submissions";
import authRouter from "./auth";
import debugEmailRouter from "./debug-email";
import activityLogsRouter from "./activity-logs";
import analystsRouter from "./analysts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(walletsRouter);
router.use(searchesRouter);
router.use(submissionsRouter);
router.use(debugEmailRouter);
router.use(activityLogsRouter);
router.use(analystsRouter);

export default router;
