#!/bin/bash

# SSL Certificate Generation Script for Beehive Studio
# Generates self-signed SSL certificates for development and testing

SSL_DIR="/home/kilisan/beehive-studio/nginx/ssl"
CERT_FILE="$SSL_DIR/cert.pem"
KEY_FILE="$SSL_DIR/key.pem"

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 -keyout "$KEY_FILE" -out "$CERT_FILE" -days 365 -nodes -sha256 \
  -subj "/C=US/ST=California/L=San Francisco/O=Beehive Studio/OU=Development/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:beehive.local,IP:127.0.0.1"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "SSL certificates generated successfully:"
echo "Certificate: $CERT_FILE"
echo "Private Key: $KEY_FILE"
echo ""
echo "Common Names: localhost, beehive.local, 127.0.0.1"
echo "Valid for: 365 days"