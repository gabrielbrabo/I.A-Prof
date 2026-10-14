// Service worker do I.A Prof: permite instalar como app.
// Nao guarda nada em cache (o app sempre carrega a versao mais nova do site e da API).
// Sem internet, mostra um aviso simples em vez da tela de erro do navegador.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // API, imagens etc.: direto da rede
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>I.A Prof</title>' +
            '<body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#334155;text-align:center;padding:16px">' +
            '<div><h1 style="font-size:20px">Sem conexão com a internet</h1><p>Conecte-se e toque em tentar de novo.</p>' +
            '<button onclick="location.reload()" style="background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px">Tentar de novo</button></div></body>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        )
    )
  );
});
