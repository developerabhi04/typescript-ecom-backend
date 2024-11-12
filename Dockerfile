# Use an official Node.js image as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Remove existing node_modules and lock files to avoid platform issues
RUN rm -rf node_modules package-lock.json

# Install production dependencies
RUN npm ci --only=production

# Copy the rest of the application code to the working directory
COPY . .

# Build the application for production
RUN npm run build

# Start the application in production mode
CMD ["npm", "run", "preview"]
