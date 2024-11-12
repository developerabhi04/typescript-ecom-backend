import express from "express";
import { newOrder, myOrder, allOrders, getSingleOrder, processOrder, deleteOrder } from "../controllers/order.js";
import { adminOnly } from "../middlewares/auth.js";

const router = express.Router();


router.post("/new", newOrder);

router.get("/my", myOrder);

router.get("/all", adminOnly, allOrders);

router.route("/:id")
    .get(getSingleOrder)
    .put(adminOnly, processOrder)
    .delete(adminOnly, deleteOrder)

export default router;