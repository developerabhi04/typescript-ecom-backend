import { redis, redisTTL } from "../app.js";
import { TryCatch } from "../middlewares/error.js"
import { Order } from "../models/order.js";
import { Product } from "../models/product.js";
import { User } from "../models/user.js";
import { calculatePercentage, getCategories, getChartData } from "../utils/features.js";




export const getDashboardStats = TryCatch(async (req, res, next) => {
    let stats;

    const key = "admin-stats"

    stats = await redis.get(key);

    if (stats) {
        stats = JSON.parse(stats);
    } else {

        const today = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);


        const thisMonth = {
            start: new Date(today.getFullYear(), today.getMonth(), 1),
            end: today,
        }
        const lastMonth = {
            start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
            end: new Date(today.getFullYear(), today.getMonth(), 0),
        }

        // product
        const thisMonthProductsPromise = Product.find({
            createdAt: {
                $gte: thisMonth.start,
                $lte: thisMonth.end,
            }
        });
        const lastMonthProductsPromise = Product.find({
            createdAt: {
                $gte: lastMonth.start,
                $lte: lastMonth.end,
            }
        });

        // user
        const thisMonthUsersPromise = User.find({
            createdAt: {
                $gte: thisMonth.start,
                $lte: thisMonth.end,
            }
        });
        const lastMonthUsersPromise = User.find({
            createdAt: {
                $gte: lastMonth.start,
                $lte: lastMonth.end,
            }
        });

        // order
        const thisMonthOrdersPromise = Order.find({
            createdAt: {
                $gte: thisMonth.start,
                $lte: thisMonth.end,
            }
        });
        const lastMonthOrdersPromise = Order.find({
            createdAt: {
                $gte: lastMonth.start,
                $lte: lastMonth.end,
            }
        });
        const lastSixMonthOrdersPromise = Order.find({
            createdAt: {
                $gte: sixMonthsAgo,
                $lte: today,
            }
        });

        const latestTransactionsPromise = Order.find({}).select(["orderItems", "discount", "total", "status"]).limit(4);

        // 1
        const [thisMonthProducts, thisMonthUsers, thisMonthOrders, lastMonthProducts, lastMonthUsers, lastMonthOrders, productsCount, usersCount, allOrders, lastSixMonthOrders, categories, femaleUserCount, latestTransactions] = await Promise.all([
            thisMonthProductsPromise,
            thisMonthUsersPromise,
            thisMonthOrdersPromise,
            lastMonthProductsPromise,
            lastMonthUsersPromise,
            lastMonthOrdersPromise,
            Product.countDocuments(),
            User.countDocuments(),
            Order.find({}).select("total"),
            lastSixMonthOrdersPromise,
            Product.distinct("category"),
            User.countDocuments({ gender: "female" }),
            latestTransactionsPromise,
        ]);

        const thisMonthRevenue = thisMonthOrders.reduce(
            (total, order) => total + (order.total || 0), 0
        );

        const lastMonthRevenue = lastMonthOrders.reduce(
            (total, order) => total + (order.total || 0), 0
        )

        // 2
        const changePercent = {
            revenue: calculatePercentage(thisMonthRevenue, lastMonthRevenue),
            product: calculatePercentage(
                thisMonthProducts.length,
                lastMonthProducts.length
            ),
            user: calculatePercentage(
                thisMonthUsers.length,
                lastMonthUsers.length,
            ),
            order: calculatePercentage(
                thisMonthOrders.length,
                lastMonthOrders.length,
            )
        }


        const revenue = allOrders.reduce(
            (total, order) => total + (order.total || 0), 0
        )

        const count = {
            revenue,
            product: productsCount,
            user: usersCount,
            order: allOrders.length,
        }


        const orderMonthCounts = new Array(6).fill(0);
        const orderMonthRevenue = new Array(6).fill(0);

        lastSixMonthOrders.forEach((order) => {
            const creationDate = order.createdAt;
            const monthDiff = (today.getMonth() - creationDate.getMonth() + 12) % 12;

            if (monthDiff < 6) {
                orderMonthCounts[6 - monthDiff - 1] += 1;
                orderMonthRevenue[6 - monthDiff - 1] += order.total;
            }


        });



        // look to features
        const categoryCount = await getCategories({ categories, productsCount });


        const userRatio = {
            male: usersCount - femaleUserCount,
            female: femaleUserCount,
        }


        const modifiedLatestTransaction = latestTransactions.map((i) => ({
            _id: i._id,
            discount: i.discount,
            amount: i.total,
            quantity: i.orderItems.length,
            status: i.status,
        }))

        // 
        stats = {
            categoryCount,
            changePercent,
            count,
            chart: {
                orders: orderMonthCounts,
                revenue: orderMonthRevenue,
            },
            userRatio,
            latestTransaction: modifiedLatestTransaction,

        }



        await redis.setex(key, redisTTL, JSON.stringify(stats));

    }


    return res.status(200).json({
        success: true,
        stats,
    });


});


// Pie
export const getPieCharts = TryCatch(async (req, res) => {
    let charts;

    const key = "admin-pie-charts";

    if (charts) {
        charts = JSON.parse(charts);
    } else {
        const allOrderPromise = Order.find({}).select([
            "total",
            "discount",
            "subtotal",
            "tax",
            "shippingCharges",
        ]);


        const [ProcessingOrder, shippedOrder, deliveredOrder, categories, productsCount, productsOutOfStock, allOrders, allUsers, adminUsers, customerUsers,] = await Promise.all([
            Order.countDocuments({ status: "Processing" }),
            Order.countDocuments({ status: "Shipped" }),
            Order.countDocuments({ status: "Delivered" }),
            Product.distinct("category"),
            Product.countDocuments(),
            Product.countDocuments({ stock: 0 }),
            // Order.find({}).select(["total", "discount", "subtotal", "tax", "shippingCharges"]),
            allOrderPromise,
            User.find({}).select(["dob"]),
            User.countDocuments({ role: "admin" }),
            User.countDocuments({ role: "user" }),
        ]);

        const orderFullfillment = {
            processing: ProcessingOrder,
            shipped: shippedOrder,
            delivered: deliveredOrder,
        }

        // category
        const categoryCount = await getCategories({ categories, productsCount });

        // stock-
        const stockAvailablity = {
            inStock: productsCount - productsOutOfStock,
            outOfStock: productsOutOfStock,
        }

        const grossIncome = allOrders.reduce((prev, order) =>
            prev + (order.total || 0), 0
        )

        const discount = allOrders.reduce((prev, order) =>
            prev + (order.discount || 0), 0
        )

        const productionCost = allOrders.reduce((prev, order) =>
            prev + (order.shippingCharges || 0), 0
        )

        const burnt = allOrders.reduce((prev, order) =>
            prev + (order.tax || 0), 0
        )

        const marketingCost = Math.round(grossIncome * (30 / 100));

        const netMargin = grossIncome - discount - productionCost - burnt - marketingCost;



        const revenueDistribution = {
            netMargin,
            discount,
            productionCost,
            taxburnt: burnt,
            marketingCost,
        }

        const userAgeGroup = {
            teen: allUsers.filter((i) => i.age < 20).length,
            adult: allUsers.filter((i) => i.age >= 20 && i.age < 40).length,
            old: allUsers.filter((i) => i.age >= 40).length,
        }

        const adminCustomer = {
            admin: adminUsers,
            user: customerUsers,
        }

        charts = {
            orderFullfillment,
            productCategories: categoryCount,
            stockAvailablity,
            revenueDistribution,
            adminCustomer,
            userAgeGroup,
        }

        await redis.setex(key, redisTTL, JSON.stringify(charts));

    }


    return res.status(200).json({
        success: true,
        charts,
    });
})



export const getBarCharts = TryCatch(async (req, res, next) => {
    let charts;
    const key = "admin-bar-charts";

    if (charts) {
        charts = JSON.parse(charts);
    } else {

        const today = new Date();

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);


        const sixMonthProductPromise = Product.find({
            createdAt: {
                $gte: sixMonthsAgo,
                $lte: today,
            },
        }).select("createdAt");
        const sixMonthUsersPromise = User.find({
            createdAt: {
                $gte: sixMonthsAgo,
                $lte: today,
            },
        }).select("createdAt");
        const twelveMonthOrdersPromise = Order.find({
            createdAt: {
                $gte: twelveMonthsAgo,
                $lte: today,
            },
        }).select("createdAt");


        const [products, users, orders] = await Promise.all([
            sixMonthProductPromise,
            sixMonthUsersPromise,
            twelveMonthOrdersPromise,
        ])


        const productCounts = getChartData({ length: 6, today, docArr: products });
        const usersCounts = getChartData({ length: 6, today, docArr: users });
        const ordersCounts = getChartData({ length: 12, today, docArr: orders });


        charts = {
            users: usersCounts,
            products: productCounts,
            orders: ordersCounts,
        }

        await redis.setex(key, redisTTL, JSON.stringify(charts));
    }

    return res.status(200).json({
        success: true,
        charts,
    });
})



export const getLineCharts = TryCatch(async (req, res, next) => {

    let charts;
    const key = "admin-line-charts";

    if (charts) {
        charts = JSON.parse(key);
    } else {

        const today = new Date();

        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);


        const baseQuery = {
            createdAt: {
                $gte: twelveMonthsAgo,
                $lte: today,
            },
        }

        const twelveMonthProductsPromise = Product.find(baseQuery).select("createdAt");

        const twelveMonthUsersPromise = User.find(baseQuery).select("createdAt");

        const twelveMonthOrdersPromise = Order.find(baseQuery).select(["createdAt", "discount", "total"]);


        const [products, users, orders] = await Promise.all([
            twelveMonthProductsPromise,
            twelveMonthUsersPromise,
            twelveMonthOrdersPromise,
        ])


        const productCounts = getChartData({ length: 12, today, docArr: products });
        const usersCounts = getChartData({ length: 12, today, docArr: users });
        const discount = getChartData({ length: 12, today, docArr: orders, property: "discount" });
        const revenue = getChartData({ length: 12, today, docArr: orders, property: "total" });


        charts = {
            users: usersCounts,
            products: productCounts,
            // orders: ordersCounts,
            discount,
            revenue,
        }

        await redis.setex(key, redisTTL, JSON.stringify(charts));
    }

    return res.status(200).json({
        success: true,
        charts,
    });

})















// const today = new Date();

// // const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
// // const endOfThisMonth = today;
// const thisMonth = {
//     start: new Date(today.getFullYear(), today.getMonth(), 1),
//     end: today,
// }

// // const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
// // const EndOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
// const lastMonth = {
//     start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
//     end: new Date(today.getFullYear(), today.getMonth(), 0),
// }




// const productChangePercent = calculatePercentage(
//     thisMonthProducts.length,
//     lastMonthProducts.length,
// );
// const userChangePercent = calculatePercentage(
//     thisMonthUsers.length,
//     lastMonthUsers.length,
// );
// const orderChangePercent = calculatePercentage(
//     thisMonthOrders.length,
//     lastMonthOrders.length,
// );









// export const getDashboardStats = TryCatch(async (req, res, next) => {
//     let stats = {};

//     const key = "admin-stats"

//     if (myCache.has(key)) {
//         stats = JSON.parse(myCache.get(key) as string);
//     } else {

//         const today = new Date();
//         const sixMonthsAgo = new Date();
//         sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);


//         const thisMonth = {
//             start: new Date(today.getFullYear(), today.getMonth(), 1),
//             end: today,
//         }
//         const lastMonth = {
//             start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
//             end: new Date(today.getFullYear(), today.getMonth(), 0),
//         }

//         // product
//         const thisMonthProductsPromise = Product.find({
//             createdAt: {
//                 $gte: thisMonth.start,
//                 $lte: thisMonth.end,
//             }
//         });
//         const lastMonthProductsPromise = Product.find({
//             createdAt: {
//                 $gte: lastMonth.start,
//                 $lte: lastMonth.end,
//             }
//         });

//         // user
//         const thisMonthUsersPromise = User.find({
//             createdAt: {
//                 $gte: thisMonth.start,
//                 $lte: thisMonth.end,
//             }
//         });
//         const lastMonthUsersPromise = User.find({
//             createdAt: {
//                 $gte: lastMonth.start,
//                 $lte: lastMonth.end,
//             }
//         });

//         // order
//         const thisMonthOrdersPromise = Order.find({
//             createdAt: {
//                 $gte: thisMonth.start,
//                 $lte: thisMonth.end,
//             }
//         });
//         const lastMonthOrdersPromise = Order.find({
//             createdAt: {
//                 $gte: lastMonth.start,
//                 $lte: lastMonth.end,
//             }
//         });
//         const lastSixMonthOrdersPromise = Order.find({
//             createdAt: {
//                 $gte: sixMonthsAgo,
//                 $lte: today,
//             }
//         });

//         const latestTransactionsPromise = Order.find({}).select(["orderItems", "discount", "total", "status"]).limit(4);

//         // 1
//         const [thisMonthProducts, thisMonthUsers, thisMonthOrders, lastMonthProducts, lastMonthUsers, lastMonthOrders, productsCount, usersCount, allOrders, lastSixMonthOrders, categories, femaleUserCount, latestTransactions] = await Promise.all([
//             thisMonthProductsPromise,
//             thisMonthUsersPromise,
//             thisMonthOrdersPromise,
//             lastMonthProductsPromise,
//             lastMonthUsersPromise,
//             lastMonthOrdersPromise,
//             Product.countDocuments(),
//             User.countDocuments(),
//             Order.find({}).select("total"),
//             lastSixMonthOrdersPromise,
//             Product.distinct("category"),
//             User.countDocuments({ gender: "female" }),
//             latestTransactionsPromise,
//         ]);

//         const thisMonthRevenue = thisMonthOrders.reduce(
//             (total, order) => total + (order.total || 0), 0
//         );

//         const lastMonthRevenue = lastMonthOrders.reduce(
//             (total, order) => total + (order.total || 0), 0
//         )

//         // 2
//         const changePercent = {
//             revenue: calculatePercentage(thisMonthRevenue, lastMonthRevenue),
//             product: calculatePercentage(
//                 thisMonthProducts.length,
//                 lastMonthProducts.length
//             ),
//             user: calculatePercentage(
//                 thisMonthUsers.length,
//                 lastMonthUsers.length,
//             ),
//             order: calculatePercentage(
//                 thisMonthOrders.length,
//                 lastMonthOrders.length,
//             )
//         }

//         const revenue = allOrders.reduce(
//             (total, order) => total + (order.total || 0), 0
//         )

//         const count = {
//             revenue,
//             product: productsCount,
//             user: usersCount,
//             order: allOrders.length,
//         }




//         const orderMonthCounts = new Array(6).fill(0);
//         const orderMonthRevenue = new Array(6).fill(0);

//         lastSixMonthOrders.forEach((order) => {
//             const creationDate = order.createdAt;
//             const monthDiff = (today.getMonth() - creationDate.getMonth() + 12) % 12

//             if (monthDiff < 6) {
//                 orderMonthCounts[6 - monthDiff - 1] += 1;
//                 orderMonthRevenue[6 - monthDiff - 1] += order.total;
//             }
//         })

//         // for (let i = 0; i < lastSixMonthOrders.length; i++) {
//         //     const order = lastSixMonthOrders[i];
//         //     const creationDate = order.createdAt;
//         //     const monthDiff = today.getMonth() - creationDate.getMonth();

//         //     if (monthDiff < 6) {
//         //         orderMonthCounts[6 - monthDiff - 1] += 1;
//         //         orderMonthRevenue[6 - monthDiff - 1] += order.total;
//         //     }
//         // }

//         // look to features
//         // const categoriesCountPromise = categories.map((category) => Product.countDocuments({ category }))

//         // const categoriesCount = await Promise.all(categoriesCountPromise);

//         // const categoryCount: Record<string, number>[] = [];

//         const categoryCount = await getCategories({ categories, productsCount });

//         // categories.forEach((category, i) => {
//         //     categoryCount.push({
//         //         [category]: Math.round((categoriesCount[i] / productsCount) * 100),
//         //     })
//         // })



//         const userRatio = {
//             male: usersCount - femaleUserCount,
//             female: femaleUserCount,
//         }


//         const modifiedLatestTransaction = latestTransactions.map((i) => ({
//             _id: i._id,
//             discount: i.discount,
//             amount: i.total,
//             quantity: i.orderItems.length,
//             status: i.status,
//         }))

//         //
//         stats = {
//             categoryCount,
//             changePercent,
//             count,
//             chart: {
//                 order: orderMonthCounts,
//                 revenue: orderMonthRevenue,
//             },
//             userRatio,
//             latestTransactions: modifiedLatestTransaction,

//         }



//         myCache.set(key, JSON.stringify(stats));

//     }


//     return res.status(200).json({
//         success: true,
//         stats,
//     });


// });