import express from "express";
import { allReviewsOfProduct, deleteProduct, deleteReview, getAdminProducts, getAllCategories, getAllProducts, getlatestProducts, getSingleProduct, newProduct, newReview, updateProduct } from "../controllers/product.js";
import { mutliUpload } from "../middlewares/multer.js";
import { adminOnly } from "../middlewares/auth.js";

const router = express.Router();

// To Create New Product
router.post("/new", adminOnly, mutliUpload, newProduct);

// To get All Products with filters
router.get("/all", getAllProducts);

// To get Last 10 Products
router.get("/latest", getlatestProducts);

// To get all unique Categories
router.get("/categories", getAllCategories);

// To get all Products
router.get("/admin-products", adminOnly, getAdminProducts);


router.route("/:id")
    .get(getSingleProduct)
    .put(adminOnly, mutliUpload, updateProduct)
    .delete(adminOnly, deleteProduct)


router.post("/review/new/:id", newReview);
router.get("/reviews/:id", allReviewsOfProduct);
router.delete("/review/:id", deleteReview);




export default router;