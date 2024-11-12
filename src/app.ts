import express from 'express';
import { connectDB, connectRedis } from './utils/features.js';
import { errorMiddleware } from './middlewares/error.js';
import { config } from "dotenv";
import morgan from "morgan";
import Stripe from 'stripe';
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";


// Importing Routes
import userRoute from './routes/user.js';
import productRoute from './routes/product.js';
import orderRoute from './routes/order.js';
import paymentRoute from './routes/payment.js';
import dashboardRoute from './routes/statistics.js';

config({
    path: "./.env"
})

const PORT = process.env.PORT || 5000;
const mongoURI = process.env.MONGO_URI || "";
const stripeKey = process.env.STRIPE_KEY || "";
const clientURL = process.env.CLIENT_URL || "";
const redisURL = process.env.REDIS_URL || "";
export const redisTTL = process.env.REDIS_TTL || 60 * 60 * 4;


// Database
connectDB(mongoURI);
export const redis = connectRedis(redisURL);

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET,
});



export const stripe = new Stripe(stripeKey);


const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use(
    cors({
        origin: [clientURL],
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);


app.get("/", (req, res) => {
    res.send("API working Fine")
})

// Using Routes
app.use("/api/v1/user", userRoute);
app.use("/api/v1/product", productRoute);
app.use("/api/v1/order", orderRoute);
app.use("/api/v1/payment", paymentRoute);
app.use("/api/v1/dashboard", dashboardRoute);


app.use("/uploads", express.static("uploads"));

// Errorhandling midddleware
app.use(errorMiddleware);


app.listen(PORT, () => {
    console.log(`Server is working on ${PORT}`);
})