# Example production configuration

Starting points for running the published image `ghcr.io/nvanderploeg/work-state` behind a reverse
proxy. Adapt them to your host.

| File                           | What it is                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.prod.yml`             | MySQL and the app, with the app bound to `127.0.0.1:3280`. Migrations run at boot. MySQL is sized for a small shared host.                                                 |
| `workstate.env.example`        | Copy to `workstate.env` and `chmod 600` it. Passwords are hex only (`openssl rand -hex 24`) because they are spliced into `DATABASE_URL`. Set `ORIGIN` to your public URL. |
| `nginx/workstate.conf.example` | A server block for nginx. The stream route turns off buffering and holds connections for an hour; both routes pass `X-Real-IP`, which the app's write limit keys on.       |
| `systemd/workstate-update.*`   | A timer that pulls `latest` every 10 minutes and recreates the app when the image changed. Expects the stack in `/opt/workstate`.                                          |

```sh
docker compose -p workstate --env-file deploy/workstate.env -f deploy/compose.prod.yml up -d
```

Pin a build with `WORKSTATE_TAG=sha-<short>` to roll back. `GET /api/health` answers
`{"service":"workstate",...,"db":"ok"}` when the app and database are up.
