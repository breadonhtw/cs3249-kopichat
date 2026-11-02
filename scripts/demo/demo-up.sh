#!/bin/zsh
# Start the Kopichat demo servers (backend on 8000, frontend dev server on 5173) and reset the store to the six
# seeds. Safe to run twice: a port already listening is left alone. Logs and pids go to <repo>/.demo/.
# Scheduled by ~/Library/LaunchAgents/sg.kopichat.demo-up.plist; run by hand with: zsh scripts/demo/demo-up.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/Users/brandon/.nvm/versions/node/v22.22.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$ROOT" || exit 1
mkdir -p .demo
echo "[$(date '+%H:%M:%S')] demo-up" >> .demo/demo.log

if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "backend already listening on 8000" >> .demo/demo.log
else
  nohup .venv/bin/python -m uvicorn backend.app:app --port 8000 >> .demo/backend.log 2>&1 &
  echo $! > .demo/backend.pid
  echo "backend started, pid $(cat .demo/backend.pid)" >> .demo/demo.log
fi

if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "frontend already listening on 5173" >> .demo/demo.log
else
  nohup npm --prefix frontend run start -- --no-open >> .demo/frontend.log 2>&1 &
  echo $! > .demo/frontend.pid
  echo "frontend started, pid $(cat .demo/frontend.pid)" >> .demo/demo.log
fi

# Give the backend a moment, then put the store back to the six seed accounts.
for i in {1..20}; do
  if curl -s -o /dev/null http://localhost:8000/api/review/groups; then break; fi
  sleep 1
done
if curl -s -X POST http://localhost:8000/api/admin/reset >/dev/null; then
  echo "store reset to the seeds" >> .demo/demo.log
else
  echo "could not reset the store (backend not answering)" >> .demo/demo.log
fi
