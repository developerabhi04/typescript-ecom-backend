import { Request } from "express";
import { TryCatch } from "../middlewares/error.js";
import { NewOrderRequestBody } from "../types/types.js";
import { Order } from "../models/order.js";
import { invalidatesCache, reducerStock } from "../utils/features.js";
import ErrorHandler from "../utils/utility-class.js";
import { redis, redisTTL } from "../app.js";





// get- my order
export const myOrder = TryCatch(async (req, res, next) => {

    const { id: user } = req.query;

    const key = `my-orders-${user}`

    let orders;

    orders = await redis.get(key);

    if (orders) {
        orders = JSON.parse(orders);

    } else {
        orders = await Order.find({ user });
        await redis.setex(key, redisTTL, JSON.stringify(orders));
    }


    return res.status(200).json({
        success: true,
        orders,
    });
});


// get-All orders
export const allOrders = TryCatch(async (req, res, next) => {

    const key = `all-orders`;

    let orders;
    if (orders) {
        orders = JSON.parse(orders)

    } else {
        orders = await Order.find().populate("user", "name");
        await redis.setex(key, redisTTL, JSON.stringify(orders));
    }


    return res.status(200).json({
        success: true,
        orders,
    });
});


// get-Single-order
export const getSingleOrder = TryCatch(async (req, res, next) => {
    const { id } = req.params;
    const key = `order-${id}`;

    let order;
    if (order) {
        order = JSON.parse(order)

    } else {
        order = await Order.findById(id).populate("user", "name");

        if (!order) return next(new ErrorHandler("Order Not Found", 404))

        await redis.setex(key, redisTTL, JSON.stringify(order));
    }


    return res.status(200).json({
        success: true,
        order,
    });
});


// create order
export const newOrder = TryCatch(async (req: Request<{}, {}, NewOrderRequestBody>, res, next) => {

    const {
        shippingInfo,
        orderItems,
        user,
        subtotal,
        tax,
        shippingCharges,
        discount,
        total,
    } = req.body;

    if (!shippingInfo || !orderItems || !user || !subtotal || !tax || !total) {
        return next(new ErrorHandler("Please Enter All Fields", 400))
    }

    const order = await Order.create({
        shippingInfo,
        orderItems,
        user,
        subtotal,
        tax,
        shippingCharges,
        discount,
        total,
    });

    await reducerStock(orderItems)


    await invalidatesCache({
        product: true,
        order: true,
        admin: true,
        userId: user,
        productId: order.orderItems.map((i) => String(i.productId)),
    });

    return res.status(201).json({
        success: true,
        message: "Order Placed Successfully",
    });


})



// update 
export const processOrder = TryCatch(async (req, res, next) => {

    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) return next(new ErrorHandler("Order Not Found", 404));

    switch (order.status) {
        case "Processing":
            order.status = "Shipped";
            break;
        case "Shipped":
            order.status = "Delivered";
            break;
        default:
            order.status = "Delivered";
            break;
    }

    await order.save()

    await invalidatesCache({
        product: false,
        order: true,
        admin: true,
        userId: order.user,
        orderId: String(order._id),
    });

    return res.status(200).json({
        success: true,
        message: "Order Processed Successfully",
    });

})


// Delete Order
export const deleteOrder = TryCatch(async (req, res, next) => {

    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) return next(new ErrorHandler("Order Not Found", 404));


    await order.deleteOne()

    await invalidatesCache({
        product: false,
        order: true,
        admin: true,
        userId: order.user,
        orderId: String(order._id),
    });

    return res.status(200).json({
        success: true,
        message: "Order Deleted Successfully",
    });

})