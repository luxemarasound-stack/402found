FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY dashboard.html /usr/share/nginx/html/dashboard.html
COPY llms.txt /usr/share/nginx/html/llms.txt
COPY icons/ /usr/share/nginx/html/icons/
COPY robots.txt /usr/share/nginx/html/robots.txt
COPY sitemap.xml /usr/share/nginx/html/sitemap.xml
COPY .well-known/ /usr/share/nginx/html/.well-known/
