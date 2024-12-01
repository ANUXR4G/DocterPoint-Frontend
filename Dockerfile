# use the offifical python runtime as the base image
FROM python:3.12-slim-bookworm

# set the working directory inside the container
WORKDIR /code

# copy and set the required dependecies file to working directory
COPY ./requirements.txt ./

# copy the rest of the application to working directory 
COPY . .

# install the dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

EXPOSE 3001

# run the development command
CMD ["python", "main.py"]