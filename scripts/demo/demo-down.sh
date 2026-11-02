#!/bin/zsh
# Stop whatever listens on the demo ports (8000 and 5173), then remove today's two launchd jobs so they do not fire
# again next year. Scheduled by ~/Library/LaunchAgents/sg.kopichat.demo-down.plist; run by hand with:
#   zsh scripts/demo/demo-down.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$ROOT" || exit 1
mkdir -p .demo
echo "[$(date '+%H:%M:%S')] demo-down" >> .demo/demo.log

for port in 8000 5173; do
  pids="$(lsof -nP -t -iTCP:$port -sTCP:LISTEN 2>/dev/null)"
  if [ -n "$pids" ]; then
    echo "stopping port $port: $pids" >> .demo/demo.log
    kill $pids 2>/dev/null
  fi
done
rm -f .demo/backend.pid .demo/frontend.pid

# One-day schedule: unload both jobs. (Each bootout fails harmlessly if the job is already gone.)
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/sg.kopichat.demo-up" 2>/dev/null
launchctl bootout "gui/$UID_NUM/sg.kopichat.demo-down" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/sg.kopichat.demo-up.plist" "$HOME/Library/LaunchAgents/sg.kopichat.demo-down.plist"
echo "launchd jobs removed" >> .demo/demo.log
