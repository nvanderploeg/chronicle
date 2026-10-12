# Deploying workstate

Target: the nanzero server, `workstate.nanzero.com`, behind system nginx. The image is
`ghcr.io/nvanderploeg/agent-work-track`, built by `.github/workflows/docker.yml`.

1. DNS: add an A record for `workstate.nanzero.com` pointing at the server.
2. Copy `deploy/compose.prod.yml` and `deploy/workstate.env.example` to the server (keep the
   `deploy/` directory layout). Save the example as `deploy/workstate.env`, fill in
   `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` (`openssl rand -hex 24`), and `chmod 600` it.
3. Start the stack:

   ```sh
   docker compose -p workstate --env-file deploy/workstate.env -f deploy/compose.prod.yml up -d
   ```

   The app listens on `127.0.0.1:3280` and runs migrations at boot. If the package is
   private, `docker login ghcr.io` with a `read:packages` token first.

4. Install the nginx server blocks and reload:

   ```sh
   cp deploy/nginx/workstate.nanzero.com.conf /etc/nginx/sites-available/
   ln -s /etc/nginx/sites-available/workstate.nanzero.com.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```

5. Issue the certificate (certbot rewrites the listen lines):

   ```sh
   certbot --nginx -d workstate.nanzero.com
   ```

6. Verify:

   ```sh
   curl https://workstate.nanzero.com/api/health
   curl -N https://workstate.nanzero.com/api/projects/<id>/stream
   ```

   The first returns `{"service":"workstate",...,"db":"ok"}`. The second holds the connection
   open and prints events as they happen.

## Upgrade

```sh
docker compose -p workstate --env-file deploy/workstate.env -f deploy/compose.prod.yml pull app
docker compose -p workstate --env-file deploy/workstate.env -f deploy/compose.prod.yml up -d
```

Pin a build with `WORKSTATE_TAG=sha-<short>` in the environment to roll back.
