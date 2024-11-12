import { TryCatch } from "../middlewares/error.js";
import { BaseQuery, NewProductRequestBody, SearchRequestQuery } from "../types/types.js";
import { Product } from "../models/product.js";
import ErrorHandler from "../utils/utility-class.js";
import { redis, redisTTL } from "../app.js";
import { deleteFromCloudinary, findAverageRatings, invalidatesCache, uploadToCloudinary } from "../utils/features.js";
import { Request } from "express";
import { User } from "../models/user.js";
import { Review } from "../models/review.js";
// import { faker } from "@faker-js/faker";




// Revalidate on New, Update, Delete Product & on New Order
export const getlatestProducts = TryCatch(async (req, res, next) => {
    let products;

    products = await redis.get("latest-products");

    if (products) {
        products = JSON.parse(products);
    } else {
        products = await Product.find({}).sort({ createdAt: -1 }).limit(5);
        await redis.setex("latest-products", redisTTL, JSON.stringify(products));
    }


    return res.status(200).json({
        success: true,
        products,
    })
})


// Revalidate on New, Update, Delete Product & on New Order
export const getAllCategories = TryCatch(async (req, res, next) => {
    let categories;

    categories = await redis.get("categories");

    if (categories) {
        categories = JSON.parse(categories);
    } else {
        categories = await Product.distinct("category");
        await redis.setex("categories",redisTTL, JSON.stringify(categories));
    }


    return res.status(200).json({
        success: true,
        categories,
    })
})


// Revalidate on New, Update, Delete Product & on New Order
export const getAdminProducts = TryCatch(async (req, res, next) => {
    let products;

    products = await redis.get("all-products")

    if (products) {
        products = JSON.parse(products);
    } else {
        products = await Product.find({});
        await redis.set("all-products", JSON.stringify(products));
    }

    return res.status(200).json({
        success: true,
        products,
    })
})


// Revalidate on New, Update, Delete Product & on New Order
export const getSingleProduct = TryCatch(async (req, res, next) => {

    let product;
    const id = req.params.id;

    const key = `product-${id}`;

    product = await redis.get(key);

    if (product) {
        product = JSON.parse(product);
    } else {
        product = await Product.findById(id);

        if (!product) return next(new ErrorHandler("Product Not Found", 404));

        await redis.setex(`product-${id}`,redisTTL, JSON.stringify(product));
    }


    return res.status(200).json({
        success: true,
        product,
    })
})


// Create or add product
export const newProduct = TryCatch(async (req: Request<{}, {}, NewProductRequestBody>, res, next) => {

    const { name, price, stock, category, description } = req.body;
    const photos = req.files as Express.Multer.File[] | undefined;

    if (!photos) return next(new ErrorHandler("Please Add Photo", 400));

    if (photos.length < 1) return next(new ErrorHandler("Please Add atleast one Photo", 400));

    if (photos.length > 5) return next(new ErrorHandler("You can upload only 5 photos", 400));


    if (!name || !price || !stock || !category || !description) {
        return next(new ErrorHandler("Please Enter All Fields", 400));
    }

    // upload here
    const photoURL = await uploadToCloudinary(photos)


    await Product.create({
        name,
        price,
        description,
        stock,
        category: category.toLowerCase(),
        photos: photoURL,

    });

    await invalidatesCache({
        product: true,
        admin: true,
    });

    return res.status(201).json({
        success: true,
        message: "Product Created SuccessFully",
    })
})



export const updateProduct = TryCatch(async (req, res, next) => {
    const { id } = req.params;
    const { name, price, stock, category, description } = req.body;
    const photos = req.files as Express.Multer.File[] | undefined;

    // Find the product by id
    const product = await Product.findById(id);

    if (!product) return next(new ErrorHandler("Product not found", 404));

    // Handle photos update
    if (photos && photos.length > 0) {
        // Upload new photos to Cloudinary
        const photosURL = await uploadToCloudinary(photos);

        // Remove old photos from Cloudinary
        const ids = product.photos.map((photo) => photo.public_id);
        await deleteFromCloudinary(ids);

        // Clear the product.photos array correctly
        product.photos.splice(0, product.photos.length);

        // Add the new photos using the push method to keep it a Mongoose DocumentArray
        photosURL.forEach((photo) => {
            product.photos.push({
                url: photo.url,
                public_id: photo.public_id,
            });
        });
    }

    // Update other fields
    if (name) product.name = name;
    if (price) product.price = price;
    if (stock) product.stock = stock;
    if (category) product.category = category;
    if (description) product.description = description;

    // Save the updated product
    await product.save();

    await invalidatesCache({
        product: true,
        productId: String(product._id),
        admin: true,
    });

    return res.status(200).json({
        success: true,
        message: "Product updated successfully",
    });
});








export const deleteProduct = TryCatch(async (req, res, next) => {
    const product = await Product.findById(req.params.id);

    if (!product) return next(new ErrorHandler("Product Not Found", 404));


    const ids = product.photos.map((photo) => photo.public_id);
    await deleteFromCloudinary(ids);

    await product.deleteOne();

    await invalidatesCache({
        product: true,
        productId: String(product._id),
        admin: true,
    });


    return res.status(200).json({
        success: true,
        message: "Product Deleted SuccessFully",
    });
})





// Get All Product
export const getAllProducts = TryCatch(async (req: Request<{}, {}, {}, SearchRequestQuery>, res, next) => {
    const { search, sort, category, price } = req.query;

    const page = Number(req.query.page) || 1;

    // 
    const key = `products-${search}-${sort}-${category}-${price}-${page}`;

    let products;
    let totalPage;

    const cachedData = await redis.get(key);
    if (cachedData) {
        const data = JSON.parse(cachedData);
        totalPage = data.totalPage;
        products = data.products;
    } else {
        // 1,2,3,4,5,6,7,8
        // 9,10,11,12,13,14,15,16
        // 17,18,19,20,21,22,23,24

        const limit = Number(process.env.PRODUCT_PER_PAGE) || 6;
        const skip = (page - 1) * limit;

        const baseQuery: BaseQuery = {};

        // price: {
        //     $lte: Number(price)
        // },
        // category,

        if (search) {
            baseQuery.name = {
                $regex: search,
                $options: "i",
            }
        }

        if (price) {
            baseQuery.price = {
                $lte: Number(price)
            }
        }

        if (category) {
            baseQuery.category = category;
        }

        // in promise

        const productsPromise = Product.find(baseQuery)
            .sort(sort && { price: sort === "asc" ? 1 : - 1 })
            .limit(limit)
            .skip(skip);

        const [productsFetched, filteredOnlyproduct] = await Promise.all([
            productsPromise,
            Product.find(baseQuery),
        ])

        products = productsFetched;
        const totalPage = Math.ceil(filteredOnlyproduct.length / limit);

        await redis.setex(key, redisTTL, JSON.stringify({ products, totalPage }));

    }
    return res.status(200).json({
        success: true,
        products,
        totalPage,
    })
})



// review
export const allReviewsOfProduct = TryCatch(async (req, res, next) => {

    let reviews;

    const key = `reviews-${req.params.id}`

    reviews = await redis.get(key);

    if (reviews) {
        reviews = JSON.parse(reviews);
    } else {
        reviews = await Review.find({
            product: req.params.id,
        }).populate("user", "name photo").sort({ updatedAt: -1 })

        await redis.setex(key, redisTTL, JSON.stringify(reviews));
    }

    return res.status(200).json({
        success: true,
        reviews,
    });

})


export const newReview = TryCatch(async (req, res, next) => {
    const user = await User.findById(req.query.id);

    if (!user) return next(new ErrorHandler("Not Logged In", 400));

    const product = await Product.findById(req.params.id);
    if (!product) return next(new ErrorHandler("Product Not Found", 404));

    const { comment, rating } = req.body;


    const allreadyReviewed = await Review.findOne({
        user: user._id,
        product: product._id,
    })

    if (allreadyReviewed) {
        allreadyReviewed.comment = comment;
        allreadyReviewed.rating = rating;

        await allreadyReviewed.save();
    } else {
        await Review.create({
            comment,
            rating,
            user: user._id,
            product: product._id,
        });
    }
    // rating
    let totalRating = 0;

    const reviews = await Review.find({ product: product._id });
    reviews.forEach((review) => {
        totalRating += review.rating;
    });

    const averateRating = Math.floor(totalRating / reviews.length) || 0;
    product.ratings = averateRating;
    product.numOfReviews = reviews.length;
    // 

    await product.save();

    // const { ratings, numOfReviews } = await findAverageRatings(product._id);

    // product.ratings = ratings;
    // product.numOfReviews = numOfReviews;

    await invalidatesCache({
        product: true,
        productId: String(product._id),
        admin: true,
        review: true,
    });


    return res.status(allreadyReviewed ? 200 : 201).json({
        success: true,
        message: allreadyReviewed ? "Review Updated" : "Review Submitted SuccessFully",
    });

})


export const deleteReview = TryCatch(async (req, res, next) => {
    const user = await User.findById(req.query.id);

    if (!user) return next(new ErrorHandler("Not Logged In", 400));

    const review = await Review.findById(req.params.id);
    if (!review) return next(new ErrorHandler("Review Not Found", 404));


    const isAuthenticUser = review.user.toString() === user._id.toString();

    if (!isAuthenticUser) return next(new ErrorHandler("Not Authorized", 401));

    await review.deleteOne();


    const product = await Product.findById(review.product);

    if (!product) return next(new ErrorHandler("Product Not Found", 404));


    // 
    const { ratings, numOfReviews } = await findAverageRatings(product._id);

    product.ratings = ratings;
    product.numOfReviews = numOfReviews;

    await product.save();


    await invalidatesCache({
        product: true,
        productId: String(product._id),
        admin: true,
    });


    return res.status(200).json({
        success: true,
        message: "Review Deleted SuccessFully",
    });

})







// generate rabdom product

// const generateRandomProducts = async (count: number = 10) => {
//     const products = [];

//     for (let i = 0; i < count; i++) {
//         const product = {
//             name: faker.commerce.productName(),
//             photo: "uploads\\6f59f9de-647f-440d-92ab-6b1064505106.jpeg",
//             price: faker.commerce.price({ min: 1500, max: 100000, dec: 0 }),
//             stock: faker.commerce.price({ min: 0, max: 500, dec: 0 }),
//             category: faker.commerce.department(),
//             createdAt: new Date(faker.date.past()),
//             updatedAt: new Date(faker.date.recent()),
//             __v: 0,
//         };

//         products.push(product);
//     }

//     await Product.create(products);

//     console.log({ success: true });

// }

// generateRandomProducts(50)

// delete-product

// const deleteRandomsProducts = async (count: number = 10) => {
//     const products = await Product.find({}).skip(2);

//     for (let i = 0; i < products.length; i++) {
//         const product = products[i];
//         await product.deleteOne();
//     }

//     console.log({ success: true });

// }
// deleteRandomsProducts(30)