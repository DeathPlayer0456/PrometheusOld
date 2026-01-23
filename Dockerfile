# Use Node.js base image
FROM node:18-slim

# Install LuaJIT
RUN apt-get update && apt-get install -y \
    luajit \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy all project files (including your Prometheus obfuscator)
COPY . .

# Create temp directory
RUN mkdir -p temp

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
