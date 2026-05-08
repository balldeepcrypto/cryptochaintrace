import { Router, type IRouter } from "express";
import healthRouter from "./health";
import walletsRouter from "./wallets";
import searchesRouter from "./searches";

const router: IRouter = Router();

router.use(healthRouter);
router.use(walletsRouter);
router.use(searchesRouter);

export default router;
