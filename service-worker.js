/**
 * 救急外来 振り返りシート PWA - Service Worker
 *
 * 戦略：
 *   - インストール時にアプリ本体（index.html とアイコン、manifest）を
 *     キャッシュし、完全オフラインで動作させる。
 *   - 再訪問時は cache-first で即座に表示し、裏でネットワーク更新をチェック
 *     する stale-while-revalidate を採用。
 *   - 更新はキャッシュ名の CACHE_VERSION をバンプするだけで反映される。
 *     localStorage のデータ（nr キー）には一切触れない。
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `furikaeri-${CACHE_VERSION}`;

// キャッシュ対象。パスはすべて相対でルート配下を想定。
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// ------------------------------------------------------------------
// install: 必要リソースをプリキャッシュ
// ------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // 新しい SW を即座にアクティブ化
  self.skipWaiting();
});

// ------------------------------------------------------------------
// activate: 古いバージョンのキャッシュを削除
// ------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('furikaeri-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ------------------------------------------------------------------
// fetch: 同一オリジンの GET のみハンドリング
// ------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET 以外（例：フォーム POST）はネットワークに丸投げ
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 別オリジン（CDN など）は SW で触らない
  if (url.origin !== self.location.origin) return;

  // ナビゲーション（ページ遷移）リクエスト
  // → オフライン時は index.html を返す
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 成功したらキャッシュも更新
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // その他の同一オリジンリソース：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // 2xx のみキャッシュ更新
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // オフライン時はキャッシュで代用
      return cached || network;
    })
  );
});
