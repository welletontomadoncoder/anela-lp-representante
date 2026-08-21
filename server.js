'use strict';
/**
 * LP da representante Anela — servidor Node ZERO-DEP.
 *
 * Por que existe (21/08/2026, etapa E4 do plano em OFICINA-TRAFEGO-PAGO.md):
 *   A LP antiga vivia no Builderall (~R$297/mes, na conta de franquia do gestor que saiu) e
 *   media 16,8% de `landing_page_view` sobre os cliques -- 83% de quem clicava NUNCA via a
 *   pagina. Esta aqui e um HTML unico, sem build, sem CDN e sem dependencia: e o conserto
 *   direto desse numero. Roda na nossa VPS, no nosso dominio.
 *
 * O que ele faz:
 *   GET  /            -> a LP (cache curto, para publicar correcao sem esperar)
 *   GET  /privacidade -> a politica (exigida pelo Meta e pela LGPD)
 *   POST /api/clique  -> registra o clique no WhatsApp com a ORIGEM (o buraco medido)
 *   GET  /saude       -> para o monitor
 *
 * O que ele NAO faz (de proposito): nao guarda PII, nao fala com a Kommo, nao envia CAPI.
 *   O evento que ENSINA o Meta e o "formulario da Respondi preenchido", e ele nasce na
 *   KOMMO -- e a etapa E5, nao esta aqui. Esta pagina so entrega a pessoa no WhatsApp
 *   carregando a origem junto.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORTA = process.env.PORT || 8080;
const RAIZ = path.join(__dirname, 'public');
const LOG = process.env.LP_LOG || path.join(__dirname, 'cliques.log');
const WHATSAPP = process.env.LP_WHATSAPP || '5519989058111';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function servir(res, arquivo, cache) {
  fs.readFile(arquivo, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('nao encontrado'); }
    let corpo = buf;
    if (arquivo.endsWith('index.html')) {
      // O numero do WhatsApp vem do AMBIENTE, nunca chumbado no HTML: em 21/08 medimos que
      // o evento `Contact` do pixel apontava pra um numero que a pagina nao usava mais.
      corpo = Buffer.from(buf.toString('utf8').replace(
        '</head>',
        `<script>window.__ANELA__={whatsapp:${JSON.stringify(WHATSAPP)}};</script></head>`));
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
      'Cache-Control': cache || 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.end(corpo);
  });
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rota = url.pathname;

  if (rota === '/saude') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, whatsapp_configurado: Boolean(WHATSAPP) }));
  }

  if (rota === '/api/clique' && req.method === 'POST') {
    let corpo = '';
    req.on('data', (c) => { corpo += c; if (corpo.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(corpo || '{}');
        // Sem PII: so a ORIGEM e o id do evento. Quem guarda pessoa e a Kommo.
        fs.appendFile(LOG, JSON.stringify({
          t: new Date().toISOString(),
          ref: String(d.ref || '').slice(0, 64),
          event_id: String(d.event_id || '').slice(0, 64),
          pos: String(d.pos || '').slice(0, 16),
        }) + '\n', () => {});
      } catch (e) { /* medicao nunca derruba a pagina */ }
      res.writeHead(204); res.end();
    });
    return;
  }

  if (rota === '/' || rota === '/index.html') return servir(res, path.join(RAIZ, 'index.html'));
  if (rota === '/privacidade') return servir(res, path.join(RAIZ, 'privacidade.html'));

  // arquivo estatico, sem sair da pasta public
  const alvo = path.normalize(path.join(RAIZ, rota));
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403); return res.end('proibido'); }
  servir(res, alvo, 'public, max-age=86400');
});

servidor.listen(PORTA, () => {
  console.log(`[lp] no ar em http://localhost:${PORTA}  (WhatsApp: ${WHATSAPP})`);
});
