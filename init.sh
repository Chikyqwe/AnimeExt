#!/bin/bash

echo "=== Configuración automática de Nginx + Proxy + SSL + Firewall ==="

# Pedir dominio
read -p "Ingresa tu dominio (ejemplo: midominio.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "Dominio no válido."
    exit 1
fi

# Actualizar sistema
apt update -y

# Instalar dependencias
apt install nginx python3 python3-pip python3-venv ufw -y

echo "=== Configurando Firewall (UFW) ==="

# Habilitar firewall si no lo está
ufw status | grep -q inactive
if [ $? -eq 0 ]; then
    echo "Habilitando UFW..."
    ufw enable
fi

# Abrir puertos necesarios
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw reload

echo "=== Firewall configurado ==="

# Crear configuración Nginx de proxy
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

cat > $NGINX_CONF <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:2022;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Activar config
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Probar y recargar nginx
nginx -t && systemctl reload nginx

echo "=== Instalando Certbot mediante pip ==="

mkdir -p /opt/certbot
python3 -m venv /opt/certbot/

# Instalar certbot + plugin Nginx en el venv
/opt/certbot/bin/pip install --upgrade pip
/opt/certbot/bin/pip install certbot certbot-nginx

# Crear acceso global
ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot

echo "=== Generando certificados SSL ==="

certbot --nginx \
    -d $DOMAIN \
    --redirect \
    --agree-tos \
    -m admin@$DOMAIN \
    --non-interactive

echo "=== TODO COMPLETADO CON ÉXITO ==="
echo "Proxy HTTPS → localhost:2022 funcionando."
echo "Firewall abierto en puertos 80, 443 y 2022."
