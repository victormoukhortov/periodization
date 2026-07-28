/**
 * Offline shell for indy.html.
 *
 * Network first so a fresh deploy is picked up as soon as you are online, cache
 * fallback so a session logged in a basement gym still opens. Registered by
 * indy.html only when it is served over http(s); from file:// there is nothing
 * to register and the page runs uncached.
 */

var CACHE = "ppl-block-v1";
var SHELL = ["./", "./index.html", "./indy.html", "./manifest.webmanifest"];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){})
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); }).catch(function(){});
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(hit){
        return hit || caches.match("./indy.html");
      });
    })
  );
});
