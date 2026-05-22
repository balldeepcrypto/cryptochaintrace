import { Router, type IRouter } from "express";
import healthRouter from "./health";
import walletsRouter from "./wallets";
import searchesRouter from "./searches";
import submissionsRouter from "./submissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(walletsRouter);
router.use(searchesRouter);
router.use(submissionsRouter);

export default router;
