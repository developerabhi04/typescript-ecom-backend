import express from 'express';
import { adminOnly } from '../middlewares/auth.js';
import { allCoupons, applyDiscount, createPaymentIntent, deleteCoupon, getCoupon, newCoupon, updateCoupon } from '../controllers/payment.js';


const router = express.Router();

// route - /api/v1/payment/create
router.post("/create", createPaymentIntent);

router.post("/coupon/new", newCoupon);

router.get("/discount", applyDiscount);

router.get("/coupon/all", adminOnly, allCoupons);

router.route("/coupon/:id")
    .get(getCoupon)
    .put(adminOnly, updateCoupon)
    .delete(adminOnly, deleteCoupon);


export default router;