# Deployment

Deployment is prepared for an Ubuntu EC2 host but is intentionally disabled until production values and secrets are configured.

Install Docker Engine, the Compose plugin and Nginx with `deploy/ec2/bootstrap.sh`. Create the application directory with ownership restricted to the deployment user. Store the production server environment at `server/.env.production` on the host; never synchronize or overwrite it. Use `deploy/ec2/deploy.sh` from the application directory to build and update containers without removing volumes.

Configure host Nginx from `deploy/nginx/faultline.conf.example` with a real domain, validate it with `nginx -t`, then reload Nginx. Permit HTTP and HTTPS only in the AWS Security Group and restrict SSH to trusted administrator addresses. Point DNS to the EC2 address before configuring Certbot and HTTPS.

The deployment workflow requires `EC2_HOST`, `EC2_USER`, `EC2_SSH_PRIVATE_KEY` and a previously verified `EC2_SSH_KNOWN_HOSTS` secret. Configure `EC2_APP_DIR`, `APP_DOMAIN` and `ENABLE_EC2_DEPLOY` variables. Set `ENABLE_EC2_DEPLOY` to `true` only after the host, domain and protected `production` environment are ready. The Gemini review workflow requires the `GEMINI_API_KEY` secret.
