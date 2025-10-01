Place your Cloudflare Origin Certificate and private key here.

Expected file names:
- origin.crt  (certificate)
- origin.key  (private key)

After placing files, restart Nginx container:
  docker compose restart nginx

Security tip: keep this folder out of Git.
It is mounted read-only into /etc/nginx/certs in the container.