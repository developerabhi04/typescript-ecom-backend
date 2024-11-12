import express from 'express';
import { getAllUsers, newUser, getUser, deleteUser } from '../controllers/user.js';
import { adminOnly } from '../middlewares/auth.js';


const router = express.Router();

router.post("/new", newUser);

router.get("/all", adminOnly, getAllUsers);

// route - /api/v1/user/dynamicID
router.get("/:id", getUser);

router.delete("/:id", adminOnly, deleteUser);


export default router;