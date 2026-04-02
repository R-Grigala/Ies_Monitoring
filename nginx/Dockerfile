FROM nginx:1.27.0

# წაშლილი თავდაპირველი Nginx კონფიგურაცია
RUN rm /etc/nginx/conf.d/default.conf

# დააკოპირეთ თქვენი Nginx კონფიგურაცია
COPY nginx.conf /etc/nginx/conf.d/

# დააკოპირეთ სერტიფიკატები
COPY certs/ /etc/nginx/certs/