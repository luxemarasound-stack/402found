FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY dashboard.html /usr/share/nginx/html/dashboard.html
COPY llms.txt /usr/share/nginx/html/llms.txt
COPY icons/ /usr/share/nginx/html/icons/
