#!/usr/bin/env bash
# Contador de cliques da LP (anela-lp-representante).
# Le o log JSON de acesso do Caddy, filtra as requisicoes /hit (sendBeacon do
# botao do WhatsApp) e conta os cliques por ORIGEM (?origem= -> o=) e por REP (?i=).
#
# Uso:  ./contador.sh [caminho-do-log]
# Padrao: /var/log/caddy/lp.json  + os rotacionados lp-*.json e lp-*.json.gz
# (22/10: o Caddy rotaciona em .json.gz; a versao antiga so lia .json e perdia
#  todo o historico a cada rotacao.)
# o=teste* sao cliques de teste e saem da contagem.
set -euo pipefail

LOG="${1:-/var/log/caddy/lp.json}"

if [ ! -r "$LOG" ]; then
  echo "log nao encontrado ou sem permissao de leitura: $LOG" >&2
  exit 1
fi

shopt -s nullglob
ler_logs() {
  cat "$LOG"
  for f in "${LOG%.json}"-*.json; do cat "$f"; done
  for f in "${LOG%.json}"-*.json.gz; do zcat "$f"; done
}

# 1 linha por clique: "<origem>\t<rep>"
CLIQUES=$(ler_logs 2>/dev/null | jq -rR '
    fromjson? // empty
  | .request.uri // empty
  | select(startswith("/hit"))
  | (if contains("?") then split("?")[1] else "" end)
  | split("&") as $p
  | ([ $p[] | select(startswith("o=")) | .[2:] ] | (.[0] // "")) as $o
  | ([ $p[] | select(startswith("i=")) | .[2:] ] | (.[0] // "")) as $i
  | select(($o | startswith("teste")) | not)
  | "\(if $o == "" then "(sem origem)" else $o end)\t\(if $i == "" then "(sem nome)" else $i end)"
')

tabela() {
  sort | uniq -c | sort -rn | awk -v titulo="$1" '
    BEGIN { printf "%10s | %s\n", "cliques", titulo
            print  "-----------+----------------------------" }
    { c = $1; $1 = ""; sub(/^ +/, ""); printf "%10d | %s\n", c, $0; total += c }
    END { print  "-----------+----------------------------"
          printf "%10d | TOTAL\n", total }'
}

echo "== Por ORIGEM (de onde ela abriu a pagina) =="
printf '%s\n' "$CLIQUES" | grep -v '^$' | cut -f1 | tabela "origem" || true
echo
echo "== Por REP (so quem usou link com ?i=<nome>) =="
printf '%s\n' "$CLIQUES" | grep -v '^$' | cut -f2 | grep -v '^(sem nome)$' | tabela "rep" || true
