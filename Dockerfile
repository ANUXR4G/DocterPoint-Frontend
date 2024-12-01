# use the offifical node.js runtime as the base image
FROM node:20-bookworm-slim

# set the working directory inside the container
WORKDIR /app

# copy and set the package.json file to working directory
COPY package.json yarn.lock ./

# install the dependencies
RUN yarn install --frozen-lockfile

# copy the rest of the application to working directory 
COPY . .

# expose the development port
EXPOSE 3000

# run the development command
CMD ["yarn", "dev"]

