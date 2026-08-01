/**
 * @fileoverview versionManager.js - Client-Side App Version & Cache Manager
 * 
 * @description
 * Automatically tracks the application version rendered by the server vs stored in localStorage.
 * If a new version is deployed, clears browser CacheStorage, unregisters service workers,
 * updates localStorage, and performs an automatic cache-bypassing reload to ensure fresh assets.
 */

(function () {
  'use strict';

  var STORED_VERSION_KEY = 'tastytails_app_version';

  /**
   * Clears browser CacheStorage and unregisters active service workers.
   * @returns {Promise<void>}
   */
  async function clearBrowserCaches() {
    try {
      if ('caches' in window) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (key) {
          console.log('[VersionManager] Purging CacheStorage:', key);
          return caches.delete(key);
        }));
      }
    } catch (err) {
      console.warn('[VersionManager] Failed to clear CacheStorage:', err);
    }

    try {
      if ('serviceWorker' in navigator) {
        var registrations = await navigator.serviceWorker.getRegistrations();
        for (var i = 0; i < registrations.length; i++) {
          console.log('[VersionManager] Unregistering ServiceWorker:', registrations[i]);
          await registrations[i].unregister();
        }
      }
    } catch (err) {
      console.warn('[VersionManager] Failed to unregister ServiceWorker:', err);
    }
  }

  /**
   * Verifies the client's current version against a target server version.
   * If a discrepancy is found, purges cache and reloads.
   * 
   * @param {string} serverVersion - The current version broadcast by the server.
   */
  async function checkAppVersion(serverVersion) {
    if (!serverVersion) return;

    var storedVersion = localStorage.getItem(STORED_VERSION_KEY);

    if (storedVersion && storedVersion !== serverVersion) {
      console.info('[VersionManager] Version upgrade detected (' + storedVersion + ' -> ' + serverVersion + '). Clearing cache and reloading...');
      
      // Update stored version before reload to prevent infinite loop
      localStorage.setItem(STORED_VERSION_KEY, serverVersion);
      
      await clearBrowserCaches();

      // Trigger cache-bypassing reload
      if (window.location.reload) {
        window.location.reload(true);
      } else {
        window.location.href = window.location.pathname + '?v=' + encodeURIComponent(serverVersion);
      }
    } else {
      localStorage.setItem(STORED_VERSION_KEY, serverVersion);
    }
  }

  // Expose checkAppVersion globally for Socket.IO listeners
  window.checkAppVersion = checkAppVersion;

  // Run immediate verification on script load if window.APP_VERSION is set
  if (typeof window !== 'undefined' && window.APP_VERSION) {
    checkAppVersion(window.APP_VERSION);
  }
})();
