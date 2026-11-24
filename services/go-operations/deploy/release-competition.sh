#!/usr/bin/env bash
set -euo pipefail
umask 077

archive=$1
battle=/srv/boomer-battle
go=/srv/boomer-go-operations
old_battle=$battle/releases/date-fit-f34426cd/boomeroff-battle-tencent-cycle-v1
old_go=$go/releases/20261125-1
new_battle=$battle/releases/go-bridge-20261125-2
new_go=$go/releases/20261125-3
config=/etc/boomer-go-operations/battle-bridge.env
battle_drop=/etc/systemd/system/boomeroff-battle-python.service.d/30-go-bridge.conf
go_drop=/etc/systemd/system/boomer-go-operations.service.d/30-go-bridge.conf
battle_sha=e0b37e47a6080a89271410e893df95bb0ee5ff2ee775a82f414c09bf05a5507a

[[ "$(readlink -f "$battle/current")" == "$old_battle" && "$(readlink -f "$go/current")" == "$old_go" ]]
[[ ! -e "$new_battle" && ! -e "$new_go" && ! -e "$config" && ! -e "$battle_drop" && ! -e "$go_drop" ]]
printf '%s  %s\n' "$battle_sha" "$old_battle/runtime/server.py" | sha256sum -c --status
mkdir -m 755 "$new_go"
tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$new_go"
cp -a "$old_battle" "$new_battle"
patch -s -p1 -d "$new_battle" < "$new_go/deploy/battle-go-bridge.patch"
install -m 644 "$new_go/competition_bridge.py" "$new_battle/runtime/competition_bridge.py"
chmod -R a+rX "$new_go"
python3 -B -c 'import sys; [compile(open(path, "rb").read(), path, "exec") for path in sys.argv[1:]]' \
    "$new_battle/runtime/server.py" "$new_go/server.py" "$new_go/competition.py"

set_current() {
    ln -s "$2" "$1/current.go-next"
    mv -Tf "$1/current.go-next" "$1/current"
}

rollback() {
    trap - ERR
    set +e
    if [[ "$(readlink -f "$battle/current")" == "$new_battle" ]]; then set_current "$battle" "$old_battle"; fi
    if [[ "$(readlink -f "$go/current")" == "$new_go" ]]; then set_current "$go" "$old_go"; fi
    rm -f "$battle_drop" "$go_drop" "$config"
    systemctl daemon-reload
    systemctl restart boomeroff-battle-python boomer-go-operations
    printf '%s\n' 'Release smoke test failed; original service paths restored' >&2
    exit 1
}
trap rollback ERR

{
    printf 'GO_BATTLE_BRIDGE_KEY=%s\n' "$(openssl rand -hex 32)"
    printf "GO_BATTLE_STORES_JSON='%s'\n" '{"2df58305-57c1-4792-9920-3c3aa49890bc":"xtd","7111b585-7d7f-4777-b4ae-61ce2b868f78":"citic","e393a259-8318-44ec-b0b1-7be3d885436e":"metro"}'
} > "$config"
mkdir -p "$(dirname "$battle_drop")" "$(dirname "$go_drop")"
printf '[Service]\nEnvironmentFile=%s\n' "$config" > "$battle_drop"
install -m 644 "$battle_drop" "$go_drop"
systemctl daemon-reload
set_current "$battle" "$new_battle"
systemctl restart boomeroff-battle-python
curl -fsS --retry 3 --retry-connrefused --max-time 6 --resolve 'battle.boomeroff.top:443:127.0.0.1' https://battle.boomeroff.top/healthz
set_current "$go" "$new_go"
systemctl restart boomer-go-operations
curl -fsS --retry 3 --retry-connrefused --max-time 6 http://127.0.0.1:3987/healthz |
  python3 -c 'import sys,json; j=json.load(sys.stdin); assert j["version"]=="2026.11.25.3" and j["competition"] and j["learning"] and j["learning_generator_configured"] and not j["read_only"]; print(j["version"])'
trap - ERR
