set -eu

app_dir="${1:-$(pwd)}"
cd "$app_dir"
test -f docker-compose.yml
test -f server/.env.production
command -v docker >/dev/null
docker compose version >/dev/null

docker compose --env-file server/.env.production up --build -d
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:8080/api/health >/dev/null; then
    docker compose ps
    exit 0
  fi
  sleep 5
done

docker compose ps
docker compose logs --tail=100 client server
exit 1
